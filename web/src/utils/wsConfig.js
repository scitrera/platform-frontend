import {DEBUG_MODE} from '../constants/AppConstants';

export const IS_DEV_MODE = import.meta.env.MODE === 'development';

// Public build-time values only. Identity is established by auth-go and the gateway.
function configuredOrigin(value, name) {
    if (!value) return '';
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
        throw new Error(`${name} must be an HTTP(S) origin without credentials, path, query or fragment`);
    }
    return url.origin;
}

export const getSocketUrl = () => configuredOrigin(import.meta.env.VITE_WS_ORIGIN, 'VITE_WS_ORIGIN');

export const getSocketPath = (tenantId) => {
    const tenantRouting = import.meta.env.VITE_WS_TENANT_PATH !== 'false';
    return tenantId && tenantRouting ? `/${encodeURIComponent(tenantId)}/rfe1-ws` : '/rfe1-ws';
};

// Same-origin hosting reserves /api/auth/* for the auth-go external plane.
// The reverse proxy strips /api/auth, including /api/auth/auth/logout -> /auth/logout.
export const getAuthUrl = (path) => {
    const origin = configuredOrigin(import.meta.env.VITE_AUTH_ORIGIN, 'VITE_AUTH_ORIGIN');
    return `${origin || '/api/auth'}${path}`;
};

export const getLoginRedirectUrl = (returnUrl) => {
    // The first application path segment is the tenant slug. auth-go uses this
    // hint only for login branding; admission and the return destination are separate.
    const tenant = new URL(returnUrl, window.location.origin).pathname.split('/').find(Boolean);
    const loginUrl = `${getAuthUrl('/login')}?rd=${encodeURIComponent(returnUrl)}`;
    return tenant ? `${loginUrl}&tenant=${encodeURIComponent(tenant)}` : loginUrl;
};
export const getLogoutUrl = () => getAuthUrl('/auth/logout');
export const getRawSocketPath = (tenantId) => `${getSocketPath(tenantId)}/v2`;

export const getWebSocketUrl = (tenantId, {windowId} = {}) => {
    const url = new URL(getRawSocketPath(tenantId), getSocketUrl() || window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    if (windowId) url.searchParams.set('windowId', windowId);
    if (tenantId) url.searchParams.set('tenant', tenantId);
    return url.toString();
};

// Default transport. The raw WebSocket transport is now the default; Socket.IO
// remains reachable via VITE_WS_TRANSPORT or the localStorage override so a
// regression can be backed out per-browser without a redeploy. Once that escape
// hatch is no longer needed, delete the socket.io-client dependency and the
// server's sio_impl.
const DEFAULT_TRANSPORT = 'websocket';

const isTransport = (value) => value === 'websocket' || value === 'socketio';

/**
 * Resolve the transport AND where the choice came from.
 *
 * Order — build-time env, then a localStorage override, then the default. The
 * override exists so the new transport can be exercised against a DEPLOYED
 * environment, per browser, without a rebuild or a redeploy; it only selects a
 * transport, and both are equally authenticated.
 *
 * The `source` is reported because during the cutover "which transport am I
 * actually on, and why?" is the first question of every debugging session, and
 * an answer inferred from three possible inputs is a guess.
 */
export const resolveTransportChoice = () => {
    const fromEnv = import.meta.env?.VITE_WS_TRANSPORT;
    if (isTransport(fromEnv)) return {transport: fromEnv, source: 'VITE_WS_TRANSPORT'};
    try {
        const override = window.localStorage?.getItem('ws_transport');
        if (isTransport(override)) return {transport: override, source: 'localStorage override'};
    } catch {
        // localStorage can throw in a partitioned/blocked context; not a reason
        // to fail to connect.
    }
    return {transport: DEFAULT_TRANSPORT, source: 'default'};
};

/** Which transport to use: 'websocket' (raw) or 'socketio' (legacy). */
export const resolveTransport = () => resolveTransportChoice().transport;

/**
 * Socket.IO connection configuration.
 */
export const SOCKET_CONFIG = {
    useMock: false,
    debug: DEBUG_MODE,
    reconnectDelay: 3000,
    connectionOptions: {
        path: '/rfe1-ws',
        addTrailingSlash: false,
        transports: ['websocket'],
        autoConnect: true,
    },
    // Most things should be sub-5s, can be 10-15s delay if cold starting servers
    rpcTimeout: 30_000,
};
