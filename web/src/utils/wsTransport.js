import {DEBUG_MODE} from '../constants/AppConstants';

/**
 * Native-WebSocket transport with a Socket.IO-shaped surface.
 *
 * The app never used Socket.IO for anything Socket.IO does: both ends pin
 * `transports: ['websocket']` (no polling fallback), there are no rooms or
 * namespaces, and RPC is a hand-rolled `{id, type, payload}` envelope rather
 * than acks. What was left was engine.io framing around a self-describing JSON
 * message — a dependency on both ends, in two languages, buying nothing.
 *
 * So this presents the same handful of methods the app actually calls —
 * `on` / `off` / `emit` / `connect` / `disconnect` / `connected` — over a plain
 * WebSocket. `wsMessageHandlers.js` and every call site are unchanged, and
 * `MockWebSocket.js` still satisfies the same shape.
 *
 * Three things Socket.IO did implicitly are re-implemented here, because
 * dropping any of them silently degrades the app:
 *
 *  - **Reconnection** with capped backoff, and the distinction between a close
 *    we should retry and one we must not (see `CLOSE_REFUSED`).
 *  - **`connect_error` with a readable cause.** A failed WebSocket handshake is
 *    opaque to JavaScript — the browser never exposes the HTTP status — so a
 *    server that wants to explain itself has to do so *after* the upgrade. The
 *    backend accepts the socket and sends one `CONNECTION_REFUSED` frame; we
 *    turn it back into the `err.data.code` shape the existing handler reads.
 *  - **Heartbeat.** engine.io ran its own ping/pong. Here the app-level `PING`
 *    message (which the backend already answers) keeps idle intermediaries —
 *    Envoy, Cloudflare — from reaping a quiet chat session.
 */

/** Frame the server sends when it accepts a socket purely to refuse it. */
const CONNECTION_REFUSED = 'CONNECTION_REFUSED';

/**
 * Frame announcing the server registered this connection and can service it.
 *
 * `connect` fires on THIS, not on the socket opening. The server has to accept
 * a socket before it can refuse it in a way the browser can read, so `onopen`
 * means only "the transport exists" — the server may still be registering, or
 * about to turn us away. Reporting connected there would let callers issue
 * requests during a connection that is about to be refused; those get queued
 * server-side and orphaned by the close, hanging until their timeout instead of
 * failing immediately. Socket.IO fired `connect` only after its server handler
 * returned, and this restores that meaning exactly.
 */
const CONNECTION_READY = 'CONNECTION_READY';

/** Close code paired with that frame. Definitive: reconnecting cannot help. */
const CLOSE_REFUSED = 4403;

/** Normal, intentional close initiated by either side. */
const CLOSE_NORMAL = 1000;

const DEFAULT_OPTIONS = {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    // How long to wait for CONNECTION_READY after the socket opens before
    // giving up on the attempt. Matches socket.io-client's `timeout` default,
    // and exists for the same reason: a handshake that never completes must
    // become a reportable failure, not a silent wait. Two things produce that
    // here -- a server too old to send the frame, and one wedged inside
    // register_connection -- and neither is visible from the browser.
    readyTimeout: 20000,
    // Idle-timeout insurance, not liveness detection. Comfortably under the
    // 60s Envoy/Cloudflare idle defaults so a user reading a long answer
    // without typing does not get their socket reaped underneath them.
    heartbeatInterval: 25000,
};

/**
 * @param {string} url  Absolute ws:// or wss:// URL, query string included.
 * @param {object} options
 * @returns a Socket.IO-shaped client over a native WebSocket.
 */
export function createWebSocketTransport(url, options = {}) {
    const config = {...DEFAULT_OPTIONS, ...options};

    /** @type {Map<string, Set<Function>>} */
    const listeners = new Map();
    let ws = null;
    let connected = false;
    // Set by disconnect() or by a refusal: both mean "stop trying". Without it
    // a definitive rejection becomes an infinite retry loop against a server
    // that has already explained itself.
    let closedByUs = false;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let readyTimer = null;
    // Frames seen between socket-open and CONNECTION_READY. Counted purely to
    // tell two indistinguishable hangs apart when the handshake times out: a
    // server happily serving messages but too old to send the frame, versus one
    // stuck in registration and sending nothing at all.
    let framesBeforeReady = 0;

    const emitLocal = (event, ...args) => {
        const set = listeners.get(event);
        if (!set) return;
        // Copy: a handler may off() itself (or another) during dispatch.
        for (const fn of [...set]) {
            try {
                fn(...args);
            } catch (e) {
                console.error(`[ws] listener for '${event}' threw:`, e);
            }
        }
    };

    const clearReadyTimer = () => {
        if (readyTimer) {
            clearTimeout(readyTimer);
            readyTimer = null;
        }
    };

    const clearTimers = () => {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        clearReadyTimer();
    };

    const startHeartbeat = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({type: 'PING', payload: {}}));
            }
        }, config.heartbeatInterval);
    };

    const scheduleReconnect = () => {
        if (!config.reconnection || closedByUs || reconnectTimer) return;
        // Exponential with a cap, matching Socket.IO's manager.
        const delay = Math.min(
            config.reconnectionDelay * Math.pow(2, reconnectAttempts),
            config.reconnectionDelayMax,
        );
        reconnectAttempts += 1;
        DEBUG_MODE && console.log(`[ws] reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            open();
        }, delay);
    };

    /**
     * A refusal frame is the server's ONE chance to say why, so it is
     * translated into exactly the `connect_error` shape the app already
     * handles for Socket.IO's CONNECT_ERROR packet — `err.message` and
     * `err.data.code` — and it stops the retry loop, because a refusal is a
     * decision about this identity, not a blip.
     */
    const handleRefusal = (payload) => {
        clearReadyTimer();
        const err = new Error(payload?.message || 'connection refused');
        err.type = 'RefusedError';
        err.data = payload?.data || {};
        closedByUs = true;
        emitLocal('connect_error', err);
    };

    const handleFrame = (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            console.warn('[ws] dropped malformed frame');
            return;
        }
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === CONNECTION_REFUSED) {
            handleRefusal(msg.payload);
            return;
        }

        if (msg.type === CONNECTION_READY) {
            clearReadyTimer();
            connected = true;
            reconnectAttempts = 0;
            startHeartbeat();
            emitLocal('connect');
            return;
        }

        if (!connected) framesBeforeReady += 1;

        // Dispatch on the CHANNEL, falling back to the semantic type. These
        // differ in exactly one case and it matters: a failed RPC arrives on
        // channel `RPC` carrying type `RPX`, and routing it by `type` would
        // strand every rejected request until its timeout.
        const channel = msg.event || msg.type;
        if (!channel) return;
        emitLocal(channel, msg);
    };

    const open = () => {
        if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
            return;
        }
        closedByUs = false;
        framesBeforeReady = 0;

        // The initial "connecting via X -> url" line is logged by
        // WebSocketContext, which also knows WHICH transport was chosen and
        // why. Repeating the URL here produced two lines for one event that
        // looked like two different connections. Reconnects are announced by
        // scheduleReconnect, which is the only thing that knows the attempt.
        // Every handler below closes over THIS socket rather than the mutable
        // `ws`, so a callback belonging to a superseded attempt can never act
        // on the connection that replaced it.
        let socket;
        try {
            socket = new WebSocket(url);
        } catch (e) {
            const err = new Error(e?.message || 'failed to open WebSocket');
            err.type = 'TransportError';
            emitLocal('connect_error', err);
            scheduleReconnect();
            return;
        }
        ws = socket;

        socket.onopen = () => {
            // Transport is up, but we are NOT connected until the server says
            // it registered us (CONNECTION_READY). Sends are already possible
            // here — `emit` gates on readyState — and anything sent in this
            // window queues server-side and is processed after registration,
            // in order. Callers are held back because they gate on `connected`.
            DEBUG_MODE && console.log(
                `[ws] socket open; awaiting server registration (${config.readyTimeout}ms)`);

            clearReadyTimer();
            readyTimer = setTimeout(() => {
                readyTimer = null;
                if (connected || closedByUs) return;
                // Name the likely cause. The two are indistinguishable from the
                // socket alone, and the remedies are opposite ends of the
                // stack, so guessing wastes the reader's time.
                const cause = framesBeforeReady > 0
                    ? 'the server is serving messages but never sent CONNECTION_READY, which ' +
                      'means it predates the handshake — redeploy it'
                    : 'the server sent nothing at all, which means registration is stuck ' +
                      '(Aether/MemoryLayer) or it is not the expected backend';
                console.error(`[ws] handshake timed out after ${config.readyTimeout}ms: ${cause}`);
                reportConnectFailure('server never confirmed the session (CONNECTION_READY)');
                // Close THIS socket, captured explicitly — `ws` may already
                // point at a later attempt, and closing that would kill a
                // healthy connection on a timer belonging to a dead one.
                // Left open, this socket would sit there holding a server-side
                // session forever.
                try {
                    socket.close(CLOSE_NORMAL);
                } catch {
                    /* already closing */
                }
            }, config.readyTimeout);
        };

        socket.onmessage = (event) => {
            if (typeof event.data === 'string') handleFrame(event.data);
        };

        // One connect_error per attempt. `onerror` and `onclose` both fire for
        // a failed handshake, and the consumer counts these to decide when to
        // tell the user the backend is unreachable — double-counting would trip
        // that warning at half the intended threshold.
        let reportedFailure = false;
        const reportConnectFailure = (message) => {
            if (reportedFailure || connected || closedByUs) return;
            reportedFailure = true;
            // The browser deliberately withholds WHY (an ext_authz 403 on the
            // upgrade is indistinguishable from an unreachable host), so this
            // is reported as a TransportError — the same classification
            // Socket.IO used, which is what makes the existing handler re-probe
            // /checkz to attribute the failure out-of-band.
            const err = new Error(message);
            err.type = 'TransportError';
            emitLocal('connect_error', err);
        };

        socket.onerror = () => reportConnectFailure('websocket handshake failed');

        socket.onclose = (event) => {
            const wasConnected = connected;
            connected = false;
            // A pending handshake timer belongs to THIS attempt; leaving it
            // armed would fire against a later one.
            clearReadyTimer();
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }

            if (event.code === CLOSE_REFUSED) {
                // The refusal frame that preceded this already explained it and
                // stopped the retries; nothing to add.
                closedByUs = true;
            }

            if (wasConnected) {
                emitLocal('disconnect', closedByUs ? 'io client disconnect' : 'transport close');
            } else if (event.code !== CLOSE_REFUSED) {
                // Opened but died before the server registered us — a crash or
                // a drop mid-registration. There is no session to report as
                // disconnected, but the connection ATTEMPT failed and must be
                // counted, or a backend stuck in this state retries forever
                // without ever telling the user. A refusal is excluded: it
                // already reported itself, with a real reason.
                reportConnectFailure('websocket closed before the server registered the session');
            }

            // Reconnect unless WE closed. A clean 1000 from the server still
            // warrants a retry — that is what a rolling deploy looks like.
            if (!closedByUs) {
                scheduleReconnect();
            }
        };
    };

    return {
        get connected() {
            return connected;
        },

        on(event, callback) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(callback);
            return this;
        },

        off(event, callback) {
            const set = listeners.get(event);
            if (!set) return this;
            if (callback) set.delete(callback);
            else set.clear();
            return this;
        },

        /**
         * `type` here is the CHANNEL, which is NOT always `data.type`.
         *
         * An RPC request is emitted on channel `RPC` carrying the real message
         * type inside (`{id, type: 'GET_APPS', payload}`) — the same
         * channel/type split as the inbound RPX response. Socket.IO carried the
         * channel in its packet header; a raw frame has no header, so it must
         * ride in the envelope as `event`. Dropping it makes the server
         * dispatch an RPC as fire-and-forget: it answers on the wrong channel
         * with no `id`, and the caller's promise hangs until its timeout.
         */
        emit(type, data) {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.warn('[ws] not connected; message not sent:', type);
                return this;
            }
            const envelope = (data && typeof data === 'object')
                ? {...data, event: type, type: data.type || type}
                : {event: type, type, payload: data};
            ws.send(JSON.stringify(envelope));
            return this;
        },

        connect() {
            open();
            return this;
        },

        disconnect() {
            closedByUs = true;
            clearTimers();
            if (ws) {
                // Detach first: an onclose firing during teardown would emit a
                // spurious 'disconnect' and schedule a reconnect we just cancelled.
                const socket = ws;
                ws = null;
                socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
                try {
                    socket.close(CLOSE_NORMAL);
                } catch {
                    /* already closing */
                }
            }
            if (connected) {
                connected = false;
                emitLocal('disconnect', 'io client disconnect');
            }
            return this;
        },
    };
}
