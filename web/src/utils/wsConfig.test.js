import {afterEach, describe, expect, it, vi} from 'vitest';

import {
    SOCKET_CONFIG, getAuthUrl, getLoginRedirectUrl, getLogoutUrl, getRawSocketPath,
    getSocketPath, getSocketUrl, getWebSocketUrl, resolveTransport, resolveTransportChoice,
} from './wsConfig';

describe('WebSocket production routing', () => {
    it('uses the same origin with a tenant-specific Socket.IO path', () => {
        expect(getSocketUrl()).toBe('');
        expect(getSocketPath('acme')).toBe('/acme/rfe1-ws');
    });

    it('keeps an unscoped fallback path when a tenant is unavailable', () => {
        expect(getSocketPath(null)).toBe('/rfe1-ws');
    });

    it('does not add a trailing slash to the Socket.IO request path', () => {
        expect(SOCKET_CONFIG.connectionOptions.path).toBe('/rfe1-ws');
        expect(SOCKET_CONFIG.connectionOptions.addTrailingSlash).toBe(false);
    });
});

describe('raw WebSocket routing', () => {
    it('mounts under the Socket.IO path so existing routing carries it', () => {
        // Load-bearing: the gateway route is `PathPrefix /{tenant}/rfe1-ws` and
        // the Vite dev proxy is a prefix proxy on /rfe1-ws. A SIBLING path
        // (/rfe1-ws2) would match neither — Gateway API PathPrefix matches on
        // segment boundaries — and would need an infra change to ship.
        expect(getRawSocketPath('acme')).toBe('/acme/rfe1-ws/v2');
        expect(getRawSocketPath(null)).toBe('/rfe1-ws/v2');
    });

    it('builds a WebSocket URL carrying windowId and tenant', () => {
        // A raw WebSocket has no handshake payload, so what Socket.IO passed in
        // its `auth` option travels in the query string; the server needs both
        // DURING registration.
        const url = new URL(getWebSocketUrl('acme', {windowId: 'wnd-9'}));
        expect(url.protocol).toBe('ws:');
        expect(url.host).toBe(window.location.host);
        expect(url.pathname).toBe('/acme/rfe1-ws/v2');
        expect(url.searchParams.get('windowId')).toBe('wnd-9');
        expect(url.searchParams.get('tenant')).toBe('acme');
    });
});

describe('transport selection', () => {
    afterEach(() => {
        window.localStorage.removeItem('ws_transport');
        vi.unstubAllEnvs();
    });

    it('defaults to the raw WebSocket transport', () => {
        expect(resolveTransport()).toBe('websocket');
    });

    it('honours a localStorage override so the cutover can be backed out per-browser', () => {
        window.localStorage.setItem('ws_transport', 'socketio');
        expect(resolveTransport()).toBe('socketio');
    });

    it('lets a build-time env var win over the override', () => {
        vi.stubEnv('VITE_WS_TRANSPORT', 'socketio');
        window.localStorage.setItem('ws_transport', 'websocket');
        expect(resolveTransportChoice()).toEqual({
            transport: 'socketio', source: 'VITE_WS_TRANSPORT',
        });
    });

    it('ignores a value that is not a known transport', () => {
        window.localStorage.setItem('ws_transport', 'carrier-pigeon');
        expect(resolveTransport()).toBe('websocket');
    });

    it('reports WHERE the choice came from', () => {
        // "Which transport am I on, and why?" is the first question of every
        // debugging session during the cutover, and it has three possible
        // answers; inferring it from the logs was a guess.
        expect(resolveTransportChoice()).toEqual({transport: 'websocket', source: 'default'});

        window.localStorage.setItem('ws_transport', 'socketio');
        expect(resolveTransportChoice()).toEqual({
            transport: 'socketio', source: 'localStorage override',
        });
    });
});

describe('Auth production routing', () => {
    it('uses the same-origin auth proxy for auth server requests', () => {
        expect(getAuthUrl('/checkz')).toBe('/api/auth/checkz');
        expect(getLogoutUrl()).toBe('/api/auth/auth/logout');
    });

    it('passes the tenant branding hint without changing the login return URL', () => {
        expect(getLoginRedirectUrl('https://app.example.test/acme/workspace?x=1&y=2#section')).toBe(
            '/api/auth/login?rd=' + encodeURIComponent('https://app.example.test/acme/workspace?x=1&y=2#section') + '&tenant=acme',
        );
    });
});

describe('login branding boundaries', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('omits the hint at the tenant picker so auth-go can use its configured default', () => {
        const target = 'https://app.example.test/?tenant=other#section';
        const login = new URL(getLoginRedirectUrl(target), window.location.origin);
        expect(login.searchParams.has('tenant')).toBe(false);
        expect(login.searchParams.get('rd')).toBe(target);
    });

    it('uses the routed tenant with a separate auth origin and keeps return query values isolated', () => {
        vi.stubEnv('VITE_AUTH_ORIGIN', 'https://auth.example.test');
        const target = 'https://app.example.test/acme/workspace?tenant=other&rd=/elsewhere#section';
        const login = new URL(getLoginRedirectUrl(target));
        expect(login.origin).toBe('https://auth.example.test');
        expect(login.pathname).toBe('/login');
        expect(login.searchParams.getAll('tenant')).toEqual(['acme']);
        expect(login.searchParams.get('rd')).toBe(target);
    });
});

describe('operator configuration', () => {
    afterEach(() => vi.unstubAllEnvs());
    it('uses explicit secure origins without sending credentials in URLs', () => {
        vi.stubEnv('VITE_AUTH_ORIGIN', 'https://auth.example.test/');
        vi.stubEnv('VITE_WS_ORIGIN', 'https://gateway.example.test');
        expect(getAuthUrl('/checkz')).toBe('https://auth.example.test/checkz');
        expect(getLogoutUrl()).toBe('https://auth.example.test/auth/logout');
        expect(getWebSocketUrl('demo', {windowId: 'w & 1'})).toBe('wss://gateway.example.test/demo/rfe1-ws/v2?windowId=w+%26+1&tenant=demo');
    });
    it('supports an unscoped gateway endpoint with tenant query routing', () => {
        vi.stubEnv('VITE_WS_TENANT_PATH', 'false');
        const url = new URL(getWebSocketUrl('demo'));
        expect(url.pathname).toBe('/rfe1-ws/v2');
        expect(url.searchParams.get('tenant')).toBe('demo');
    });
    it('rejects credentials, paths and unsafe protocols in origins', () => {
        for (const value of ['https://user:secret@example.test', 'https://example.test/private', 'javascript:alert(1)']) {
            vi.stubEnv('VITE_WS_ORIGIN', value);
            expect(() => getSocketUrl()).toThrow();
        }
    });
    it('encodes tenant and return URL boundaries', () => {
        expect(getSocketPath('a/b')).toBe('/a%2Fb/rfe1-ws');
        const target = 'https://app.example.test/demo/work?x=1&y=2#section';
        expect(new URL(getLoginRedirectUrl(target), window.location.origin).searchParams.get('rd')).toBe(target);
    });
});
