import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {createWebSocketTransport} from './wsTransport';

/**
 * The raw transport has to be a drop-in for the Socket.IO client, because
 * `wsMessageHandlers.js` and 49 consuming components are unchanged. These pin
 * the four behaviours that swap depends on — envelope routing, refusal
 * reporting, reconnection, and the `on/off/emit/connect/disconnect` surface —
 * rather than the implementation.
 */

class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    static instances = [];

    constructor(url) {
        this.url = url;
        this.readyState = FakeWebSocket.CONNECTING;
        this.sent = [];
        this.onopen = this.onmessage = this.onerror = this.onclose = null;
        FakeWebSocket.instances.push(this);
    }

    send(data) {
        this.sent.push(JSON.parse(data));
    }

    close(code = 1000) {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.({code});
    }

    // -- test drivers --

    /** Socket opens, but the server has NOT yet registered the session. */
    serverOpensOnly() {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
    }

    /** The real sequence: socket opens, then the server confirms registration. */
    serverAccepts() {
        this.serverOpensOnly();
        this.serverSends({
            event: 'CONNECTION_READY', type: 'CONNECTION_READY', payload: {sid: 'sid-1'},
        });
    }

    serverSends(obj) {
        this.onmessage?.({data: JSON.stringify(obj)});
    }

    serverSendsRaw(text) {
        this.onmessage?.({data: text});
    }

    serverCloses(code = 1006) {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.({code});
    }
}

const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('connection lifecycle', () => {
    it('emits connect only once the SERVER confirms registration', () => {
        // Not on socket open. The server must accept a socket before it can
        // refuse it in a way the browser can read, so `onopen` means only "the
        // transport exists" -- the server may still be registering, or about to
        // turn us away. Socket.IO fired `connect` after its server handler
        // returned; CONNECTION_READY restores that meaning.
        const onConnect = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2').on('connect', onConnect);

        t.connect();
        expect(t.connected).toBe(false);

        latest().serverOpensOnly();
        expect(onConnect).not.toHaveBeenCalled();
        expect(t.connected).toBe(false);

        latest().serverSends({event: 'CONNECTION_READY', type: 'CONNECTION_READY', payload: {}});
        expect(onConnect).toHaveBeenCalledTimes(1);
        expect(t.connected).toBe(true);
    });

    it('never reports connected for a connection the server refuses', () => {
        // The regression this guards: reporting connected on socket open let
        // callers issue requests during a doomed connection. Those queue
        // server-side, get orphaned by the close, and hang until their 30s
        // timeout instead of failing immediately.
        const onConnect = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2').on('connect', onConnect);
        t.connect();
        latest().serverOpensOnly();

        latest().serverSends({
            event: 'CONNECTION_REFUSED', type: 'CONNECTION_REFUSED',
            payload: {message: 'nope', data: {code: 'no_tenants'}},
        });
        latest().serverCloses(4403);

        expect(onConnect).not.toHaveBeenCalled();
        expect(t.connected).toBe(false);
    });

    it('counts a close that arrives before registration as a failed attempt', () => {
        // A backend crashing mid-registration would otherwise retry forever in
        // silence: there is no session to report as disconnected, but the
        // ATTEMPT failed and the consumer counts these to decide when to tell
        // the user the backend is unreachable.
        const onError = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2').on('connect_error', onError);
        t.connect();
        latest().serverOpensOnly();

        latest().serverCloses(1006);

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0].type).toBe('TransportError');
    });

    it('reports at most one connect_error per attempt', () => {
        // onerror and onclose both fire for a failed handshake; double-counting
        // trips the "backend unreachable" notice at half its threshold.
        const onError = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2').on('connect_error', onError);
        t.connect();

        latest().onerror?.({});
        latest().serverCloses(1006);

        expect(onError).toHaveBeenCalledTimes(1);
    });

    it('emits disconnect and reconnects after an unexpected close', () => {
        const onDisconnect = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2').on('disconnect', onDisconnect);
        t.connect();
        latest().serverAccepts();

        latest().serverCloses(1006);

        expect(onDisconnect).toHaveBeenCalledTimes(1);
        expect(t.connected).toBe(false);
        expect(FakeWebSocket.instances).toHaveLength(1);

        vi.advanceTimersByTime(1000);
        expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it('reconnects after a CLEAN server close — that is what a rolling deploy looks like', () => {
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2');
        t.connect();
        latest().serverAccepts();

        latest().serverCloses(1000);
        vi.advanceTimersByTime(1000);

        expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it('backs off exponentially up to the cap', () => {
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2', {
            reconnectionDelay: 1000, reconnectionDelayMax: 5000,
        });
        t.connect();
        latest().serverAccepts();

        latest().serverCloses(1006);
        vi.advanceTimersByTime(999);
        expect(FakeWebSocket.instances).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(FakeWebSocket.instances).toHaveLength(2);

        latest().serverCloses(1006);      // second failure -> 2000ms
        vi.advanceTimersByTime(1999);
        expect(FakeWebSocket.instances).toHaveLength(2);
        vi.advanceTimersByTime(1);
        expect(FakeWebSocket.instances).toHaveLength(3);
    });

    it('stops reconnecting once the client disconnects', () => {
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2');
        t.connect();
        latest().serverAccepts();

        t.disconnect();
        vi.advanceTimersByTime(30000);

        expect(FakeWebSocket.instances).toHaveLength(1);
        expect(t.connected).toBe(false);
    });

    it('does not emit a spurious disconnect when the client tears down', () => {
        // The socket's onclose fires during teardown; re-entering the
        // disconnect path there would schedule a reconnect just cancelled.
        const onDisconnect = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2').on('disconnect', onDisconnect);
        t.connect();
        latest().serverAccepts();

        t.disconnect();

        expect(onDisconnect).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(30000);
        expect(FakeWebSocket.instances).toHaveLength(1);
    });
});

describe('handshake timeout', () => {
    it('fails the attempt when CONNECTION_READY never arrives', () => {
        // Without this the client waits forever with no error, no retry and no
        // way to tell the difference from a slow backend. Socket.IO has the
        // same guard (its `timeout`, also 20s) for the same reason.
        const onError = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2', {readyTimeout: 20000})
            .on('connect_error', onError);
        t.connect();
        latest().serverOpensOnly();

        vi.advanceTimersByTime(19999);
        expect(onError).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0].type).toBe('TransportError');
        expect(t.connected).toBe(false);
    });

    it('closes the timed-out socket so backoff can retry', () => {
        // Left open it holds a server-side session that will never be used.
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2', {readyTimeout: 20000});
        t.connect();
        const first = latest();
        first.serverOpensOnly();

        vi.advanceTimersByTime(20000);
        expect(first.readyState).toBe(FakeWebSocket.CLOSED);

        vi.advanceTimersByTime(1000);
        expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it('does not fire once the handshake completes', () => {
        const onError = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2', {readyTimeout: 20000})
            .on('connect_error', onError);
        t.connect();
        latest().serverAccepts();

        vi.advanceTimersByTime(60000);

        expect(onError).not.toHaveBeenCalled();
        expect(t.connected).toBe(true);
    });

    it('does not fire after a refusal, which already explained itself', () => {
        const onError = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2', {readyTimeout: 20000})
            .on('connect_error', onError);
        t.connect();
        latest().serverOpensOnly();
        latest().serverSends({
            event: 'CONNECTION_REFUSED', type: 'CONNECTION_REFUSED',
            payload: {message: 'nope', data: {code: 'no_tenants'}},
        });

        vi.advanceTimersByTime(60000);

        expect(onError).toHaveBeenCalledTimes(1);       // the refusal only
        expect(onError.mock.calls[0][0].type).toBe('RefusedError');
    });

    it('a superseded attempt never disturbs the live connection', () => {
        // An invariant, not a fixed bug: today only one handshake timer can be
        // pending (each attempt clears before re-arming) and the fire path
        // re-checks `connected`, so this already held. It is pinned because the
        // cost of losing it is severe and silent -- a healthy socket closed on
        // behalf of a dead attempt -- and nothing else would catch it.
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2', {
            readyTimeout: 20000, reconnectionDelay: 1000,
        });
        t.connect();
        const first = latest();
        first.serverOpensOnly();
        first.serverCloses(1006);          // dies before ready; timer still pending

        vi.advanceTimersByTime(1000);      // reconnect
        const second = latest();
        expect(second).not.toBe(first);
        second.serverAccepts();
        expect(t.connected).toBe(true);

        vi.advanceTimersByTime(60000);     // the first attempt's timer would fire here

        expect(t.connected).toBe(true);
        expect(second.readyState).not.toBe(FakeWebSocket.CLOSED);
    });
});

describe('refusals', () => {
    it('reports a refusal as connect_error carrying the server code', () => {
        // The whole reason the server accepts a socket it intends to reject: a
        // rejection at the upgrade is invisible to JavaScript, so this frame is
        // the only channel that can name the cause.
        const onError = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2').on('connect_error', onError);
        t.connect();
        latest().serverOpensOnly();

        latest().serverSends({
            event: 'CONNECTION_REFUSED',
            type: 'CONNECTION_REFUSED',
            payload: {
                message: 'your account is not associated with any organization',
                data: {code: 'no_tenants'},
            },
        });

        expect(onError).toHaveBeenCalledTimes(1);
        const err = onError.mock.calls[0][0];
        // Exactly the shape the existing handler reads off Socket.IO's
        // CONNECT_ERROR packet, so WebSocketContext needs no change.
        expect(err.data.code).toBe('no_tenants');
        expect(err.message).toContain('organization');
    });

    it('stops retrying after a refusal', () => {
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2');
        t.connect();
        latest().serverOpensOnly();

        latest().serverSends({
            event: 'CONNECTION_REFUSED', type: 'CONNECTION_REFUSED',
            payload: {message: 'nope', data: {code: 'tenant_not_permitted'}},
        });
        latest().serverCloses(4403);

        vi.advanceTimersByTime(60000);
        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('classifies an opaque handshake failure as a TransportError', () => {
        // The browser hides the upgrade's HTTP status, so an ext_authz 403 and
        // an unreachable host are indistinguishable here. That classification
        // is what makes WebSocketContext re-probe /checkz to attribute it.
        const onError = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2').on('connect_error', onError);
        t.connect();

        latest().onerror?.({});

        expect(onError.mock.calls[0][0].type).toBe('TransportError');
    });
});

describe('message routing', () => {
    it('dispatches a frame to the handler for its channel', () => {
        const onWorkspaces = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2')
            .on('GET_WORKSPACES', onWorkspaces);
        t.connect();
        latest().serverAccepts();

        const frame = {event: 'GET_WORKSPACES', type: 'GET_WORKSPACES', payload: [{id: 'w1'}]};
        latest().serverSends(frame);

        expect(onWorkspaces).toHaveBeenCalledWith(frame);
    });

    it('routes a failed RPC by CHANNEL, not by type', () => {
        // The one case where the two differ, and it is load-bearing: an RPC
        // failure arrives on channel RPC carrying type RPX. Dispatching on
        // `type` would strand every rejected request until its timeout.
        const onRpc = vi.fn();
        const onRpx = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2')
            .on('RPC', onRpc).on('RPX', onRpx);
        t.connect();
        latest().serverAccepts();

        latest().serverSends({
            event: 'RPC', type: 'RPX', id: 7,
            payload: {message: 'workspace is gone', type: 'GET_APPS'},
        });

        expect(onRpc).toHaveBeenCalledTimes(1);
        expect(onRpc.mock.calls[0][0].id).toBe(7);
        expect(onRpx).not.toHaveBeenCalled();
    });

    it('falls back to type when a frame carries no channel', () => {
        const handler = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2').on('TOAST', handler);
        t.connect();
        latest().serverAccepts();

        latest().serverSends({type: 'TOAST', payload: {text: 'hi'}});

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('survives malformed frames', () => {
        const handler = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2').on('TOAST', handler);
        t.connect();
        latest().serverAccepts();

        latest().serverSendsRaw('{not json');
        latest().serverSendsRaw('"bare string"');
        latest().serverSends({payload: {}});           // no channel and no type
        latest().serverSends({type: 'TOAST', payload: {}});

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('keeps dispatching when one handler throws', () => {
        const bad = vi.fn(() => {
            throw new Error('handler bug');
        });
        const good = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2').on('TOAST', bad).on('TOAST', good);
        t.connect();
        latest().serverAccepts();

        latest().serverSends({type: 'TOAST', payload: {}});

        expect(bad).toHaveBeenCalled();
        expect(good).toHaveBeenCalled();
    });
});

describe('client surface', () => {
    it('sends the envelope the server parses', () => {
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2');
        t.connect();
        latest().serverAccepts();

        // Matches WebSocketContext.sendMessage: the type is passed twice, and
        // the object is what goes on the wire.
        t.emit('GET_WORKSPACES', {type: 'GET_WORKSPACES', payload: {a: 1}, windowId: 'wnd-1'});

        expect(latest().sent).toContainEqual({
            event: 'GET_WORKSPACES', type: 'GET_WORKSPACES', payload: {a: 1}, windowId: 'wnd-1',
        });
    });

    it('preserves the RPC channel when it differs from the message type', () => {
        // sendRpcRequest emits on channel `RPC` with the real type inside.
        // Socket.IO carried that channel in its packet header; a raw frame has
        // none, so dropping it made the server dispatch every RPC as
        // fire-and-forget -- answered on the wrong channel with no `id`, so the
        // caller's promise hung for its full 30s timeout. Every RPC in the app.
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2');
        t.connect();
        latest().serverAccepts();

        t.emit('RPC', {id: 1, type: 'DYNAMIC_JSX_CONTENT', payload: {appId: 'x'}, windowId: 'w'});

        const sent = latest().sent.find(m => m.id === 1);
        expect(sent.event).toBe('RPC');
        expect(sent.type).toBe('DYNAMIC_JSX_CONTENT');
    });

    it('does not throw when emitting while disconnected', () => {
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2');
        expect(() => t.emit('PING', {type: 'PING'})).not.toThrow();
    });

    it('off() removes a handler', () => {
        const handler = vi.fn();
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2').on('TOAST', handler);
        t.connect();
        latest().serverAccepts();

        t.off('TOAST', handler);
        latest().serverSends({type: 'TOAST', payload: {}});

        expect(handler).not.toHaveBeenCalled();
    });

    it('heartbeats so idle intermediaries do not reap a quiet session', () => {
        // engine.io ran its own ping/pong; without a replacement an Envoy or
        // Cloudflare idle timeout closes a socket the user is still reading on.
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2', {heartbeatInterval: 25000});
        t.connect();
        latest().serverAccepts();

        vi.advanceTimersByTime(25000);

        expect(latest().sent).toContainEqual({type: 'PING', payload: {}});
    });

    it('stops heartbeating after disconnect', () => {
        const t = createWebSocketTransport('ws://x/rfe1-ws/v2', {heartbeatInterval: 25000});
        t.connect();
        latest().serverAccepts();
        const socket = latest();

        t.disconnect();
        vi.advanceTimersByTime(100000);

        expect(socket.sent).toHaveLength(0);
    });
});
