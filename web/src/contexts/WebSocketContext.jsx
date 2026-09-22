import React, {useState, createContext, useCallback, useEffect, useMemo, useRef} from 'react';
import {io} from 'socket.io-client';
import {CONNECTION, CONNECTION_REFUSED, WORKSPACE} from '../constants/WebSocketConstants';
import {DEBUG_MODE} from '../constants/AppConstants';
import {useChatState} from "../hooks/useChatState";
import {generateId, sessionStorageStateInit} from "../lib/utils.ts";
import {
    getSocketUrl, getSocketPath, getWebSocketUrl, getAuthUrl, getLoginRedirectUrl,
    resolveTransportChoice, SOCKET_CONFIG,
} from '../utils/wsConfig.js';
import {createWebSocketTransport} from '../utils/wsTransport.js';
import {setupSocketMessageHandlers} from '../utils/wsMessageHandlers.js';
import {useAuthStore} from '../stores/authStore';
import {useWorkspaceStore} from '../stores/workspaceStore';
import {useAppPanelStore} from '../stores/appPanelStore';
import {parseUrlPath} from '../utils/urlUtils.js';

// App-listener churn warning. A handful of re-registrations is normal (an
// effect re-running when a dependency legitimately changes); this many inside
// one window means it re-runs on every render instead. Deliberately loose —
// the warning has to be worth reading when it appears.
const LISTENER_CHURN_WINDOW_MS = 5000;
const LISTENER_CHURN_THRESHOLD = 10;

// Seed workspace/app/path/query/hash stores from the current URL so that the
// stores reflect the URL on initial load. Must run synchronously alongside
// setCurrentTenant so React batches all the writes into one render — otherwise
// useURLSync fires first and wipes the URL.
const hydrateStateFromUrl = () => {
    const {workspaceId, appId, queryParams, hashParams, appPath} = parseUrlPath();
    if (workspaceId) {
        useWorkspaceStore.getState().setCurrentWorkspace(workspaceId);
    }
    if (appId && workspaceId) {
        useAppPanelStore.getState().loadApp(
            {id: appId, type: appId, title: appId},
            {queryParams: queryParams || null, hashParams, appPath, stateOnly: true},
        );
    }
};

// Consecutive failed handshakes after which an otherwise-unattributable
// connection failure is surfaced to the user as "backend unreachable". High
// enough to ride out a pod restart / rolling deploy, low enough that nobody
// stares at a silent reconnect spinner indefinitely.
const UNREACHABLE_AFTER_ATTEMPTS = 5;

// Server refusal code -> the denial the UI renders. An unmapped code still
// denies (falling through to 'unreachable'), because a refusal we don't
// recognise is still a refusal — better a vague explanation than a silent
// reconnect loop.
const REFUSAL_TO_DENIAL = {
    [CONNECTION_REFUSED.NO_TENANTS]: 'no-tenants',
    [CONNECTION_REFUSED.TENANT_NOT_PERMITTED]: 'no-grant',
    [CONNECTION_REFUSED.INTERNAL]: 'unreachable',
};

const WebSocketContext = createContext(null);

// Split by change-rate. See the provider for why; the short version is that
// dynamicJSXContent changes on every inbound JSX message, so anything sharing
// a context value with it re-renders at that rate.
/** Stable for the life of a socket: send/connect/subscribe. */
const WebSocketApiContext = createContext(null);
/** Connection + auth state. Changes on connect/disconnect/auth. */
const WebSocketStatusContext = createContext(null);
/** Per-message dynamic JSX payloads. The fastest-changing slice. */
const WebSocketJsxContext = createContext(null);

export const WebSocketProvider = ({children}) => {
    // Read tenantId reactively so the connect effect fires when a tenant becomes
    // available; auth-state writes are dispatched into the Zustand authStore.
    const tenantId = useAuthStore(s => s.tenantId);

    const [socket, setSocket] = useState(null);
    const [backendVersion, setBackendVersion] = useState('unknown');
    const [backendBuildDate, setBackendBuildDate] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    const [dynamicJSXContent, setDynamicJSXContent] = useState({});
    const reconnectTimeout = useRef(null);
    const isReconnecting = useRef(false);
    // Consecutive connect_error count, reset on a successful connect.
    const connectErrorCount = useRef(0);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [windowId] = useState(sessionStorageStateInit("windowId", generateId('wnd')));

    // RPC mechanism refs
    const pendingRequests = useRef(new Map());
    const nextRequestId = useRef(1);
    const inFlightByType = useRef(new Map());

    // Chat state — Phase 4: legacy WorkingMessage plumbing is gone; the
    // spec map is the source of truth.
    const {
        upsertSpecMessage,
        setSpecMessagesList,
        setLatestProgress: setLatestChatProgress,
        setThreadsList: setChatThreads, activeThreadId,
        setActiveChatTask, clearActiveChatTask, setActiveChatTasksMap,
        renameThreadInList,
        // Universal messaging-spec stream dispatch — feeds the
        // applyEvent reducer in useChatState.specMessages.
        dispatchSpecEvent,
    } = useChatState();

    // Stable refs for values used inside socket handlers
    const activeThreadIdRef = useRef(activeThreadId);
    const socketRef = useRef(socket);
    const windowIdRef = useRef(windowId);

    useEffect(() => { activeThreadIdRef.current = activeThreadId; }, [activeThreadId]);
    useEffect(() => { socketRef.current = socket; }, [socket]);
    useEffect(() => { windowIdRef.current = windowId; }, [windowId]);

    // Record an authorization failure and STOP trying to connect.
    //
    // Tearing the socket down matters as much as the state write: socket.io
    // reconnects indefinitely by default, and a 403 at the gateway is not a
    // transient condition it can retry its way out of — every attempt produces
    // an identical opaque transport error and another auth-go "ACL denied" log
    // line. A manual disconnect() also halts the reconnection manager, so the
    // spin stops until something clears the denial.
    const denyAccess = useCallback((reason, email = null) => {
        // The denial is usually detected BEFORE a tenant is selected (the
        // pre-connect probe), so fall back to the tenant named in the URL —
        // otherwise the message cannot say which tenant was refused.
        const tenantFromUrl = window.location.pathname.split('/').filter(Boolean)[0] || null;
        useAuthStore.getState().setAccessDenied({
            reason,
            tenantId: useAuthStore.getState().tenantId || tenantFromUrl,
            email,
        });

        if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
            reconnectTimeout.current = null;
        }
        isReconnecting.current = false;

        const s = socketRef.current;
        if (s) {
            s.disconnect();
        }
        setIsConnected(false);
    }, []);

    // Check authentication status.
    //
    // Returns true only when the session is valid AND, so far as we can tell,
    // the identity may reach the backend. Authentication and AUTHORIZATION are
    // different questions: a user can hold a perfectly valid session (200,
    // auth: valid) while the gateway's ext_authz 403s every gated route,
    // including the socket.io handshake. A browser never exposes the HTTP
    // status of a failed WebSocket upgrade to JS, so the SPA cannot read that
    // 403 off the socket — it needs to be told out-of-band.
    const checkAuthentication = useCallback(async () => {
        DEBUG_MODE && console.log('call to checkAuthentication()')
        try {
            const authCheckUrl = getAuthUrl('/checkz');
            DEBUG_MODE && console.log('Auth check URL:', authCheckUrl);

            const response = await fetch(authCheckUrl, {
                method: 'GET',
                credentials: 'include',
            });

            if (response.status === 401 || response.status === 403 || response.status === 307) {
                useAuthStore.getState().setAuthenticated(false);
                setIsAuthenticated(false);
                window.location.assign(getLoginRedirectUrl(window.location.href));
                return false;
            } else if (response.ok) {
                const authData = await response.json();
                useAuthStore.getState().setAuthenticated(true);
                setIsAuthenticated(true);
                DEBUG_MODE && console.log('User is authenticated');

                // Authorization gate.
                //
                // NOTE: auth-go does NOT currently emit `authorized` — nothing
                // server-side answers "may this identity reach the backend?" on
                // a channel the SPA can read, so today this branch never fires
                // and an authorization denial surfaces via the coarser
                // 'unreachable' path below. This is the seam for when the edge
                // gate is corrected to evaluate per-tenant authorization and can
                // report it; wiring the client first keeps that a server-only
                // change.
                //
                // Deny ONLY on an explicit `false`. An ABSENT field means
                // "undetermined" (not emitted at all, or the server could not
                // determine it), and treating absence as denial would lock every
                // user out — including right now.
                if (authData.authorized === false) {
                    console.warn('Authenticated but NOT authorized for backend access');
                    denyAccess('no-grant', authData.email);
                    return false;
                }

                // A valid session with no tenant linkage is the other shape of
                // "you may sign in but you may not use anything". Reported as
                // an empty array (user known to MT, linked to nothing) or an
                // absent one (email unknown to MT entirely).
                if (!authData.tenants || authData.tenants.length === 0) {
                    console.warn('Authenticated but no tenants are available to this account');
                    denyAccess('no-tenants', authData.email);
                    return false;
                }

                // Reaching here means AUTHORIZATION is (currently) fine, so
                // clear a denial of that kind — a grant added server-side then
                // recovers the UI without a reload. An 'unreachable' denial is
                // deliberately left alone: this probe says nothing about the
                // socket, and since it re-runs on every failed handshake,
                // clearing it here would make the notice flicker away and back
                // on each retry. Only a successful connect clears that one.
                const denial = useAuthStore.getState().accessDenied;
                if (denial && denial.reason !== 'unreachable') {
                    useAuthStore.getState().setAccessDenied(null);
                }

                if (authData.tenants) {
                    useAuthStore.getState().setTenantsList(authData.tenants);

                    const currentPath = window.location.pathname;
                    const pathParts = currentPath.split('/').filter(part => part !== '');
                    const tenantIdFromUrl = pathParts[0];

                    if (!tenantIdFromUrl && authData.tenants.length > 1) {
                        useAuthStore.getState().setNeedsTenantSelection(true);
                        return true;
                    }

                    if (tenantIdFromUrl) {
                        const validTenant = authData.tenants.find(t => t.id === tenantIdFromUrl);
                        if (validTenant) {
                            useAuthStore.getState().setCurrentTenant(validTenant);
                            hydrateStateFromUrl();
                            return true;
                        } else {
                            useAuthStore.getState().setNeedsTenantSelection(true);
                            return true;
                        }
                    }

                    if (authData.tenants.length === 1) {
                        DEBUG_MODE && console.log("Automatically Selecting Tenant due to length == 1");
                        useAuthStore.getState().setCurrentTenant(authData.tenants[0]);
                        hydrateStateFromUrl();
                        return true;
                    }
                }

                return true;
            } else {
                console.error('Authentication check failed:', response.status);
                useAuthStore.getState().setAuthenticated(false);
                setIsAuthenticated(false);
                return false;
            }
        } catch (error) {
            console.error('Error checking authentication:', error);
            useAuthStore.getState().setAuthenticated(false);
            setIsAuthenticated(false);
            return false;
        }
        // denyAccess is the only non-module, non-setter closure here; it is a
        // useCallback([]) so this identity is stable for the session.
    }, [denyAccess]);

    // region Core Functionality
    const connect = useCallback((tenantIdArg = null) => {
        if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
            reconnectTimeout.current = null;
        }

        isReconnecting.current = true;

        const socketUrl = getSocketUrl();
        const socketPath = getSocketPath(tenantIdArg);
        // 'websocket' (raw) or 'socketio' (legacy). Both speak the same
        // envelope and expose the same client surface, so nothing below this
        // line — including every handler in wsMessageHandlers.js — differs
        // between them. See wsConfig.resolveTransportChoice.
        const {transport, source: transportSource} = resolveTransportChoice();

        const localSocketConfig = {
            ...SOCKET_CONFIG.connectionOptions,
            path: socketPath,
            auth: {
                'windowId': windowId,
                'tenant': tenantIdArg,
            }
        };

        // Build the connection BEFORE logging, so the log can name the endpoint
        // actually used. The previous version printed the Socket.IO path
        // unconditionally, which read as a flat contradiction next to
        // "transport: websocket" — the raw transport never touches that path,
        // and the only line naming the real endpoint came from another module.
        let socketInstance;
        let endpoint;
        let kind;
        if (transport === 'websocket') {
            kind = 'raw websocket';
            endpoint = getWebSocketUrl(tenantIdArg, {windowId});
            socketInstance = createWebSocketTransport(
                endpoint,
                {reconnectionDelay: SOCKET_CONFIG.reconnectDelay},
            );
        } else {
            kind = 'socket.io';
            // socketUrl is '' in dev (same origin, via the Vite proxy); show
            // where that actually resolves to rather than an empty string.
            endpoint = `${socketUrl || window.location.origin}${socketPath}`;
            socketInstance = io(socketUrl, localSocketConfig);
        }

        if (SOCKET_CONFIG.debug) {
            console.log(`[ws] connecting via ${kind} (${transportSource}) -> ${endpoint}`);
        }

        // Connection lifecycle handlers
        socketInstance.on('connect', () => {
            if (SOCKET_CONFIG.debug) {
                console.log(`[ws] connected (${kind})`);
            }
            connectErrorCount.current = 0;
            useAuthStore.getState().setAccessDenied(null);
            setIsConnected(true);
            setError(null);
            isReconnecting.current = false;
        });

        socketInstance.on('disconnect', (reason) => {
            if (SOCKET_CONFIG.debug) {
                console.log(`[ws] disconnected: ${reason}`);
            }
            setIsConnected(false);
        });

        // A failed handshake is DIAGNOSTICALLY OPAQUE on this transport: the
        // gateway's ext_authz rejection is an HTTP 403 on the upgrade request,
        // and the browser deliberately hides that status from JS (all we get is
        // a generic TransportError). So we re-probe /checkz — a plain fetch,
        // whose status and body we CAN read — to attribute the failure.
        // checkAuthentication() records a precise denial when it finds one.
        socketInstance.on('connect_error', async (err) => {
            connectErrorCount.current += 1;

            // The server may have told us exactly why. A CONNECT_ERROR packet
            // (socketio ConnectionRefusedError) rides the established transport,
            // so unlike the gateway's 403-on-upgrade its payload IS readable
            // here. Check it FIRST: it is authoritative and definitive, so there
            // is no point probing /checkz or counting retries.
            const refusedCode = err?.data?.code;
            if (refusedCode) {
                const denial = REFUSAL_TO_DENIAL[refusedCode] || 'unreachable';
                console.warn(
                    `[ws] refused by server (${refusedCode} -> "${denial}"): ${err.message}`,
                );
                denyAccess(denial);
                setError(err);
                setIsConnected(false);
                return;
            }

            if (err.type === 'TransportError') {
                const isAuth = await checkAuthentication();
                if (isAuth) {
                    // Name the endpoint: a handshake failure is opaque by
                    // nature, so the address that failed is most of what a
                    // reader has to go on.
                    console.error(
                        `[ws] handshake failed (attempt ${connectErrorCount.current}, ` +
                        `session is valid) -> ${endpoint}`, err,
                    );
                    // During the transport cutover this failure has one
                    // overwhelmingly likely cause, and it is invisible from the
                    // browser: /rfe1-ws/v2 is served by a NEWER app-server than
                    // the one deployed. Say so rather than let it read as a
                    // network problem.
                    if (transport === 'websocket' && connectErrorCount.current === 2) {
                        console.warn(
                            '[ws] repeated failures on the raw transport. If this backend has ' +
                            'not been redeployed, it does not serve /rfe1-ws/v2 yet — revert ' +
                            "with localStorage.removeItem('ws_transport') and reload.",
                        );
                    }
                    // Session and grant both check out, so this is a genuine
                    // transport/backend problem. Keep retrying (it may well be
                    // transient) but stop failing silently once it is clearly
                    // not a blip — the user deserves to know the app is stuck.
                    if (connectErrorCount.current >= UNREACHABLE_AFTER_ATTEMPTS &&
                        !useAuthStore.getState().accessDenied) {
                        useAuthStore.getState().setAccessDenied({
                            reason: 'unreachable',
                            tenantId: useAuthStore.getState().tenantId,
                        });
                    }
                } else {
                    // Either a login redirect is underway, or denyAccess() has
                    // recorded an authorization failure and torn the socket
                    // down. Nothing further to retry here.
                    console.log('[ws] connection abandoned: not authenticated/authorized');
                }
            } else {
                console.error('[ws] connection error:', err);
            }
            setError(err);
            setIsConnected(false);
        });

        // Wire up all message handlers (extracted to wsMessageHandlers.js)
        setupSocketMessageHandlers(socketInstance, {
            setDynamicJSXContent,
            setBackendVersion,
            setBackendBuildDate,
            pendingRequests,
            inFlightByType,
            activeThreadIdRef,
            setChatThreads,
            upsertSpecMessage,
            setSpecMessagesList,
            setLatestChatProgress,
            setActiveChatTask,
            clearActiveChatTask,
            setActiveChatTasksMap,
            renameThreadInList,
            dispatchSpecEvent,
        });

        setSocket(socketInstance);
        socketInstance.connect();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReconnecting]);

    const disconnect = useCallback(() => {
        if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
            reconnectTimeout.current = null;
        }

        isReconnecting.current = false;

        if (socket) {
            socket.disconnect();
        }
    }, [socket]);

    const sendMessage = useCallback((type, payload) => {
        const s = socketRef.current;
        const msgObj = {type, payload, windowId: windowIdRef.current};

        if (s && s.connected) {
            try {
                s.emit(type, msgObj);
                DEBUG_MODE && console.log('WebSocket Message Sent:', msgObj);
            } catch (e) {
                console.error('Error sending WebSocket message:', e);
            }
        } else {
            console.warn('WebSocket not connected. Message not sent:', msgObj);
        }
    }, []);

    const sendWsRequest = useCallback((type, payload) => {
        const msgObj = {type, payload, windowId}
        if (socket && socket.connected) {
            try {
                socket.emit(type, msgObj);
                DEBUG_MODE && console.log('WebSocket Message Sent:', msgObj);
            } catch (e) {
                console.error('Error sending WebSocket message:', e);
            }
        } else {
            throw new Error('Websocket not connected');
        }
    }, [socket, windowId]);

    useEffect(() => {
        const initializeConnection = async () => {
            DEBUG_MODE && console.log('call to initializeConnection()')
            if (isConnected) {
                return;
            }

            const isAuth = await checkAuthentication();

            if (isAuth && !isConnected && !socket && !isReconnecting.current && tenantId) {
                if (SOCKET_CONFIG.debug) {
                    console.log('Authentication successful, establishing WebSocket connection');
                }

                connect(tenantId);
            }
        };

        // noinspection JSIgnoredPromiseFromCall
        initializeConnection();

        return () => {
            disconnect();
        };
        // only dependent on tenantId to ensure we don't get stuck in reconnect loops
        // eslint-disable-next-line
    }, [tenantId]);
    // endregion

    // region RPC Functionality
    // TODO(ws): queue-and-flush instead of rejecting when disconnected.
    //
    // Effects fire on mount, before connect() runs (it waits on the /checkz
    // probe), so every caller issues a request that is rejected and then
    // repeated once connected — a wasted round and a logged error per call
    // site, on every page load. ~175 call sites share this; gating each on
    // isConnected does not scale, so the fix belongs here: hold requests made
    // before the connection is up and flush them on 'connect'.
    //
    // Not free, and the reason it is deferred rather than done inline:
    //   - the queue MUST be bounded (cap + drop-oldest, or reject past the
    //     cap), or a backend that never comes up accumulates every request the
    //     UI makes until the tab dies;
    //   - entries need their own expiry, or a request queued at t=0 resolves
    //     against a timeout that started before it was ever sent;
    //   - a permanent denial (accessDenied / a refusal) must still reject
    //     IMMEDIATELY rather than queue, or a rejected user waits out the full
    //     timeout on every action instead of being told;
    //   - flush ordering has to stay stable, since callers assume request order.
    // Behaviour is identical to Socket.IO's today, so this is an improvement,
    // not a regression to repair.
    const sendRpcRequest = useCallback((type, payload, timeout = SOCKET_CONFIG.rpcTimeout) => {
        if (!socket || !isConnected) {
            return Promise.reject(new Error('Socket not connected'));
        }

        // Dedupe: ensure only one GET_BACKGROUND_TASKS call is in-flight at a time
        const isBgTasksRequest = type === WORKSPACE.GET_BACKGROUND_TASKS;
        if (isBgTasksRequest) {
            const existing = inFlightByType.current.get(type);
            if (existing?.promise) {
                return existing.promise;
            }
        }

        const id = nextRequestId.current++;
        const promise = new Promise((resolve, reject) => {
            pendingRequests.current.set(id, {resolve, reject});

            const outgoing = {id, type, payload, windowId}
            socket.emit(CONNECTION.RPC_MESSAGE, outgoing);

            const timer = setTimeout(() => {
                if (pendingRequests.current.has(id)) {
                    pendingRequests.current.delete(id);
                    if (inFlightByType.current.get(type)?.id === id) {
                        inFlightByType.current.delete(type);
                    }
                    reject(new Error(`RPC ${type} timed out after ${timeout}ms`));
                }
            }, timeout);

            const wrappedResolve = data => {
                clearTimeout(timer);
                if (inFlightByType.current.get(type)?.id === id) {
                    inFlightByType.current.delete(type);
                }
                resolve(data);
            };
            const wrappedReject = err => {
                clearTimeout(timer);
                if (inFlightByType.current.get(type)?.id === id) {
                    inFlightByType.current.delete(type);
                }
                reject(err);
            };

            pendingRequests.current.set(id, {resolve: wrappedResolve, reject: wrappedReject});

            (DEBUG_MODE && type !== WORKSPACE.GET_BACKGROUND_TASKS &&
                console.log(`Websocket RPC message sent: ${id}|${type}`, outgoing));
        });

        if (isBgTasksRequest) {
            inFlightByType.current.set(type, {id, promise});
        }

        return promise;
    }, [socket, windowId, isConnected]);
    // endregion

    // region App Listeners
    // Live registrations, keyed by a monotonic id so a register line can be
    // paired with its unregister. Refs, not state: this is instrumentation and
    // must never cause a render (which would itself churn listeners).
    const appListeners = useRef(new Map());
    const appListenerSeq = useRef(0);
    const appListenerChurn = useRef(new Map());

    /**
     * Warn when one subscriber re-registers the same event repeatedly in a
     * short window.
     *
     * Register/unregister pairs are normal — React re-runs an effect whenever
     * a dependency changes identity. What the raw log cannot show is whether
     * that is happening a handful of times (fine) or on every render (a bug,
     * usually a callback rebuilt inline each pass). This draws the line so the
     * question does not have to be answered by counting lines by eye.
     */
    const noteListenerChurn = useCallback((type, who) => {
        const key = `${type}|${who}`;
        const now = Date.now();
        const seen = appListenerChurn.current.get(key);
        if (!seen || now - seen.since > LISTENER_CHURN_WINDOW_MS) {
            appListenerChurn.current.set(key, {since: now, count: 1, warned: false});
            return;
        }
        seen.count += 1;
        if (seen.count >= LISTENER_CHURN_THRESHOLD && !seen.warned) {
            seen.warned = true;  // once per window, or the warning becomes the noise
            console.warn(
                `[ws-listener] CHURN: <${who}> re-registered ${type} ${seen.count}x in ` +
                `${((now - seen.since) / 1000).toFixed(1)}s. Something it depends on changes ` +
                `identity every render — check the effect's dependency array ` +
                `(an inline handler, or a context value rebuilt without useMemo).`,
            );
        }
    }, []);

    const registerAppListener = useCallback((type, func, label) => {
        // The socket may not be connected yet when a consumer mounts (e.g. the
        // Knowledgebase context registers its live-reload listener at mount).
        // No-op until the socket exists; this callback's identity depends on
        // [socket], so consumers' effects re-run and register for real once it
        // becomes available.
        if (!socket) {
            if (SOCKET_CONFIG.debug) {
                // Worth saying out loud: a consumer asked and got nothing, and
                // the retry only happens because [socket] changes identity.
                console.debug(`[ws-listener] skip ${type} <${label || 'unlabeled'}> — no socket yet`);
            }
            return () => {};
        }

        const who = label || 'unlabeled';
        const id = ++appListenerSeq.current;
        const live = appListeners.current;
        live.set(id, {type, who});

        const countOf = (t) => {
            let n = 0;
            live.forEach((e) => { if (e.type === t) n += 1; });
            return n;
        };

        if (SOCKET_CONFIG.debug) {
            // Counts are the point: a register/unregister PAIR that leaves the
            // count where it started is ordinary React effect churn (a
            // re-render with an unstable dependency). A count that keeps
            // climbing is a leak — every message then runs N handlers.
            console.debug(
                `[ws-listener] + ${type} <${who}#${id}> type=${countOf(type)} total=${live.size}`,
            );
            noteListenerChurn(type, who);
        }

        const handler = (message) => {
            if (SOCKET_CONFIG.debug) {
                console.debug(`[ws-listener] recv ${type} -> <${who}#${id}>`, message);
            }
            func(message.payload);
        };

        socket.on(type, handler);

        let released = false;
        return () => {
            if (released) {
                // A double-invoked cleanup would otherwise decrement twice and
                // make the counts lie about what is actually attached.
                if (SOCKET_CONFIG.debug) {
                    console.debug(`[ws-listener] ! ${type} <${who}#${id}> released twice (ignored)`);
                }
                return;
            }
            released = true;
            live.delete(id);
            if (SOCKET_CONFIG.debug) {
                console.debug(
                    `[ws-listener] - ${type} <${who}#${id}> type=${countOf(type)} total=${live.size}`,
                );
            }
            socket.off(type, handler);
        };
    }, [socket, noteListenerChurn]);
    // endregion

    // Three slices rather than one object, because they change at wildly
    // different rates and a single value forces every consumer to re-render at
    // the fastest of them.
    //
    // The API is stable for the life of a socket. Status changes on connect,
    // disconnect and auth. dynamicJSXContent changes on EVERY inbound JSX
    // message, and always by identity (the reducer builds a new object), so
    // anything sharing a value with it re-renders per message — which is what
    // made effects keyed on the context re-subscribe ~10x/sec on load.
    const api = useMemo(() => ({
        socket,
        sendMessage,
        sendWsRequest,
        sendRpcRequest,
        registerAppListener,
        connect,
        disconnect,
        checkAuthentication,
    }), [socket, sendMessage, sendWsRequest, sendRpcRequest, registerAppListener,
        connect, disconnect, checkAuthentication]);

    const status = useMemo(() => ({
        isConnected,
        isAuthenticated,
        error,
        backendVersion,
        backendBuildDate,
    }), [isConnected, isAuthenticated, error, backendVersion, backendBuildDate]);

    const jsx = useMemo(() => ({dynamicJSXContent}), [dynamicJSXContent]);

    // Back-compat for consumers still reading the whole context. Memoized on
    // the three slices, so it changes when something ACTUALLY changed rather
    // than on every render — which is most of the win, without touching the
    // ~28 call sites. Consumers wanting the rest should move to the narrow
    // hooks, which is the only way to stop re-rendering on JSX traffic.
    const merged = useMemo(
        () => ({...api, ...status, ...jsx}),
        [api, status, jsx],
    );

    return (
        <WebSocketApiContext.Provider value={api}>
            <WebSocketStatusContext.Provider value={status}>
                <WebSocketJsxContext.Provider value={jsx}>
                    <WebSocketContext.Provider value={merged}>
                        {children}
                    </WebSocketContext.Provider>
                </WebSocketJsxContext.Provider>
            </WebSocketStatusContext.Provider>
        </WebSocketApiContext.Provider>
    );
};

export {WebSocketContext, WebSocketApiContext, WebSocketStatusContext, WebSocketJsxContext};
