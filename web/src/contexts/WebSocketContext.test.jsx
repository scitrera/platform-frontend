/**
 * Authorization handling in WebSocketProvider.
 *
 * These cover the failure mode where a user holds a VALID session but no
 * backend access grant. The gateway rejects the handshake with a 403 that the
 * browser never exposes to JS, so without an explicit signal from /checkz the
 * SPA connected forever in silence. The contract asserted here is: detect it
 * from /checkz, do NOT open (or keep) a socket, and record a denial the UI can
 * render.
 *
 * Every case runs against BOTH transports. The provider's authorization logic
 * sits above the transport — it only attaches handlers to whatever client
 * connect() built, and the raw transport reproduces Socket.IO's `connect_error`
 * shapes (`err.type`, `err.data.code`) precisely so it can. Pinning the suite to
 * one transport made the coverage silently follow the default: when the default
 * flipped to 'websocket' these tests kept passing against a transport the app no
 * longer used, while the one it did use was untested.
 */
import React from 'react';
import {render, waitFor} from '@testing-library/react';
import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';

import {io} from 'socket.io-client';

import {WebSocketProvider} from './WebSocketContext.jsx';
import {createWebSocketTransport} from '../utils/wsTransport.js';
import {useAuthStore} from '../stores/authStore';

// --- Module mocks ----------------------------------------------------------

const sockets = [];

// Both transports present the same client surface to the provider, so one fake
// serves both; which factory produced it is the only difference under test.
const makeFakeSocket = () => {
    const handlers = {};
    const socket = {
        connected: false,
        handlers,
        on: vi.fn((evt, fn) => {
            handlers[evt] = fn;
        }),
        off: vi.fn(),
        emit: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
    };
    sockets.push(socket);
    return socket;
};

vi.mock('socket.io-client', () => ({
    io: vi.fn(() => makeFakeSocket()),
}));

vi.mock('../utils/wsTransport.js', () => ({
    createWebSocketTransport: vi.fn(() => makeFakeSocket()),
}));

vi.mock('../utils/wsMessageHandlers.js', () => ({
    setupSocketMessageHandlers: vi.fn(),
}));

vi.mock('../hooks/useChatState', () => ({
    useChatState: () => ({
        upsertSpecMessage: vi.fn(),
        setSpecMessagesList: vi.fn(),
        setLatestProgress: vi.fn(),
        setThreadsList: vi.fn(),
        activeThreadId: '_default',
        setActiveChatTask: vi.fn(),
        clearActiveChatTask: vi.fn(),
        setActiveChatTasksMap: vi.fn(),
        renameThreadInList: vi.fn(),
        dispatchSpecEvent: vi.fn(),
    }),
}));

// --- Helpers ---------------------------------------------------------------

const checkzOk = (body) => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
});

const ACME = {id: 'acme', name: 'Acme Corp', logo: '', default_workspace: 'main'};

const renderProvider = () => render(<WebSocketProvider><div/></WebSocketProvider>);

const initialAuthState = useAuthStore.getState();

beforeEach(() => {
    sockets.length = 0;
    io.mockClear();
    createWebSocketTransport.mockClear();
    useAuthStore.setState({
        ...initialAuthState,
        isAuthenticated: false,
        tenantId: null,
        currentTenant: null,
        availableTenants: [],
        needsTenantSelection: false,
        accessDenied: null,
    });
    window.history.replaceState({}, '', '/acme');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.removeItem('ws_transport');
});

// --- Tests -----------------------------------------------------------------

describe.each([
    ['websocket (raw, default)'],
    ['socketio (legacy)'],
])('WebSocketProvider authorization handling over %s', (label) => {
    // Pin the transport for this suite; read by resolveTransportChoice() inside
    // connect(). Runs after the outer beforeEach, which clears `sockets`.
    beforeEach(() => {
        window.localStorage.setItem(
            'ws_transport', label.startsWith('websocket') ? 'websocket' : 'socketio',
        );
    });

    // Contract test for a field auth-go does not emit YET (see the note in
    // checkAuthentication). It pins the client half of the seam so correcting
    // the edge gate to report authorization is a server-only change.
    it('records a no-grant denial and never opens a socket when authorized is false', async () => {
        vi.stubGlobal('fetch', vi.fn(() => checkzOk({
            auth: 'valid',
            user_id: 'u@example.com',
            email: 'u@example.com',
            tenants: [ACME],       // linked to the tenant...
            access_level: 0,
            authorized: false,     // ...but holding no ACL grant
        })));

        renderProvider();

        await waitFor(() => {
            expect(useAuthStore.getState().accessDenied).not.toBeNull();
        });

        const denial = useAuthStore.getState().accessDenied;
        expect(denial.reason).toBe('no-grant');
        expect(denial.email).toBe('u@example.com');
        // Tenant is taken from the URL because the denial is detected BEFORE
        // tenant selection runs.
        expect(denial.tenantId).toBe('acme');

        // The session IS valid — this must not be mistaken for "logged out".
        expect(useAuthStore.getState().isAuthenticated).toBe(true);
        // Nothing should have been dialled: retrying a 403 is pointless.
        expect(sockets).toHaveLength(0);
    });

    it('records a no-tenants denial when the session has no tenant linkage', async () => {
        vi.stubGlobal('fetch', vi.fn(() => checkzOk({
            auth: 'valid',
            user_id: 'u@example.com',
            email: 'u@example.com',
            tenants: [],
        })));

        renderProvider();

        await waitFor(() => {
            expect(useAuthStore.getState().accessDenied?.reason).toBe('no-tenants');
        });
        expect(sockets).toHaveLength(0);
    });

    it('dials using the transport it was told to use', async () => {
        // Without this the parametrization proves nothing: the fake socket is
        // identical either way, so every case below would still pass if the
        // provider ignored the setting and always built the same client.
        vi.stubGlobal('fetch', vi.fn(() => checkzOk({
            auth: 'valid', user_id: 'u@example.com', email: 'u@example.com',
            tenants: [ACME],
        })));

        renderProvider();
        await waitFor(() => expect(sockets).toHaveLength(1));

        const raw = label.startsWith('websocket');
        expect(createWebSocketTransport).toHaveBeenCalledTimes(raw ? 1 : 0);
        expect(io).toHaveBeenCalledTimes(raw ? 0 : 1);
    });

    it('treats an ABSENT authorized field as undetermined, not as a denial', async () => {
        // auth-go omits access_level/authorized when it cannot determine them
        // (no MT repo, transient DB error). Failing closed here would lock out
        // legitimate users on a hiccup.
        vi.stubGlobal('fetch', vi.fn(() => checkzOk({
            auth: 'valid',
            user_id: 'u@example.com',
            email: 'u@example.com',
            tenants: [ACME],
        })));

        renderProvider();

        await waitFor(() => {
            expect(useAuthStore.getState().tenantId).toBe('acme');
        });
        expect(useAuthStore.getState().accessDenied).toBeNull();
        expect(sockets).toHaveLength(1);
    });

    it('tears the socket down when access is revoked mid-session', async () => {
        // First probe authorizes and connects; the grant is then removed, so the
        // handshake starts failing and the connect_error re-probe finds the denial.
        let authorized = true;
        vi.stubGlobal('fetch', vi.fn(() => checkzOk({
            auth: 'valid',
            user_id: 'u@example.com',
            email: 'u@example.com',
            tenants: [ACME],
            authorized,
        })));

        renderProvider();

        await waitFor(() => expect(sockets).toHaveLength(1));
        const socket = sockets[0];

        authorized = false;
        await socket.handlers['connect_error']({type: 'TransportError'});

        await waitFor(() => {
            expect(useAuthStore.getState().accessDenied?.reason).toBe('no-grant');
        });
        // Manual disconnect also stops socket.io's reconnection manager.
        expect(socket.disconnect).toHaveBeenCalled();
    });

    it('reports unreachable only after repeated unattributable failures', async () => {
        vi.stubGlobal('fetch', vi.fn(() => checkzOk({
            auth: 'valid',
            user_id: 'u@example.com',
            email: 'u@example.com',
            tenants: [ACME],
            authorized: true,   // authorization keeps checking out
        })));

        renderProvider();

        await waitFor(() => expect(sockets).toHaveLength(1));
        const socket = sockets[0];

        // A couple of failures are ordinary (pod restart, rolling deploy).
        await socket.handlers['connect_error']({type: 'TransportError'});
        await socket.handlers['connect_error']({type: 'TransportError'});
        expect(useAuthStore.getState().accessDenied).toBeNull();

        // Sustained failure is not; the user is told rather than left staring
        // at a silent spinner. The socket keeps retrying (it may be transient).
        for (let i = 0; i < 3; i++) {
            await socket.handlers['connect_error']({type: 'TransportError'});
        }
        await waitFor(() => {
            expect(useAuthStore.getState().accessDenied?.reason).toBe('unreachable');
        });
        expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('keeps an unreachable notice steady across retries', async () => {
        // The /checkz re-probe fired by each failed handshake says nothing about
        // the socket, so it must not clear an 'unreachable' denial — otherwise
        // the notice would blink away and back on every retry.
        vi.stubGlobal('fetch', vi.fn(() => checkzOk({
            auth: 'valid',
            user_id: 'u@example.com',
            email: 'u@example.com',
            tenants: [ACME],
            authorized: true,
        })));

        renderProvider();
        await waitFor(() => expect(sockets).toHaveLength(1));
        const socket = sockets[0];

        for (let i = 0; i < 5; i++) {
            await socket.handlers['connect_error']({type: 'TransportError'});
        }
        await waitFor(() => {
            expect(useAuthStore.getState().accessDenied?.reason).toBe('unreachable');
        });

        // Further retries keep it in place, uninterrupted.
        for (let i = 0; i < 3; i++) {
            await socket.handlers['connect_error']({type: 'TransportError'});
            expect(useAuthStore.getState().accessDenied?.reason).toBe('unreachable');
        }
    });

    // A server refusal (Socket.IO CONNECT_ERROR packet) IS readable by the
    // browser, unlike the gateway's 403 on the WebSocket upgrade. It is
    // authoritative, so it must win immediately rather than waiting out the
    // retry counter or deferring to a /checkz probe.
    it('honours a server refusal code immediately', async () => {
        vi.stubGlobal('fetch', vi.fn(() => checkzOk({
            auth: 'valid',
            user_id: 'u@example.com',
            email: 'u@example.com',
            tenants: [ACME],
            authorized: true,   // /checkz is happy; the SERVER still refused
        })));

        renderProvider();
        await waitFor(() => expect(sockets).toHaveLength(1));
        const socket = sockets[0];

        await socket.handlers['connect_error']({
            type: 'TransportError',
            message: 'your account does not have access to this organization',
            data: {code: 'tenant_not_permitted', tenant: 'acme'},
        });

        await waitFor(() => {
            expect(useAuthStore.getState().accessDenied?.reason).toBe('no-grant');
        });
        // Definitive: stop dialling rather than burning through the retry budget.
        expect(socket.disconnect).toHaveBeenCalled();
    });

    it('maps a no_tenants refusal and denies on the FIRST error', async () => {
        vi.stubGlobal('fetch', vi.fn(() => checkzOk({
            auth: 'valid', user_id: 'u@example.com', email: 'u@example.com',
            tenants: [ACME], authorized: true,
        })));

        renderProvider();
        await waitFor(() => expect(sockets).toHaveLength(1));

        await sockets[0].handlers['connect_error']({
            type: 'TransportError',
            data: {code: 'no_tenants'},
        });

        await waitFor(() => {
            expect(useAuthStore.getState().accessDenied?.reason).toBe('no-tenants');
        });
    });

    it('still denies on an UNRECOGNISED refusal code', async () => {
        // A refusal we cannot name is still a refusal — falling back to a vague
        // explanation beats a silent reconnect loop.
        vi.stubGlobal('fetch', vi.fn(() => checkzOk({
            auth: 'valid', user_id: 'u@example.com', email: 'u@example.com',
            tenants: [ACME], authorized: true,
        })));

        renderProvider();
        await waitFor(() => expect(sockets).toHaveLength(1));

        await sockets[0].handlers['connect_error']({
            type: 'TransportError',
            data: {code: 'some_future_code'},
        });

        await waitFor(() => {
            expect(useAuthStore.getState().accessDenied?.reason).toBe('unreachable');
        });
    });

    it('clears a stale denial once a connection succeeds', async () => {
        vi.stubGlobal('fetch', vi.fn(() => checkzOk({
            auth: 'valid',
            user_id: 'u@example.com',
            email: 'u@example.com',
            tenants: [ACME],
            authorized: true,
        })));
        useAuthStore.getState().setAccessDenied({reason: 'unreachable', tenantId: 'acme'});

        renderProvider();

        await waitFor(() => expect(sockets).toHaveLength(1));
        sockets[0].handlers['connect']();

        await waitFor(() => {
            expect(useAuthStore.getState().accessDenied).toBeNull();
        });
    });
});
