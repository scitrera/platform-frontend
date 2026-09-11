import {useContext} from 'react';
import {
    WebSocketApiContext,
    WebSocketJsxContext,
    WebSocketStatusContext,
} from '../contexts/WebSocketContext';

/**
 * The WebSocket API: send, connect, subscribe.
 *
 * Prefer this over useWebSocket() anywhere the result feeds an effect's
 * dependency array. The value is stable for the life of a socket, whereas the
 * combined context also carries dynamicJSXContent — which changes on every
 * inbound JSX message, so an effect keyed on it re-runs at message rate. That
 * is what made app-listener subscriptions detach and reattach ~10x/sec.
 */
export function useWebSocketApi() {
    const ctx = useContext(WebSocketApiContext);
    if (!ctx) {
        throw new Error('useWebSocketApi must be used within a WebSocketProvider');
    }
    return ctx;
}

/** Connection + auth state. Re-renders on connect/disconnect/auth only. */
export function useWebSocketStatus() {
    const ctx = useContext(WebSocketStatusContext);
    if (!ctx) {
        throw new Error('useWebSocketStatus must be used within a WebSocketProvider');
    }
    return ctx;
}

/**
 * Dynamic JSX payloads. The fastest-changing slice — subscribing re-renders
 * the caller on every inbound JSX message, which is correct for a renderer and
 * wasteful for anything else.
 */
export function useWebSocketJsx() {
    const ctx = useContext(WebSocketJsxContext);
    if (!ctx) {
        throw new Error('useWebSocketJsx must be used within a WebSocketProvider');
    }
    return ctx;
}
