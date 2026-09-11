import { useContext } from 'react';
import { WebSocketContext } from '../contexts/WebSocketContext.jsx';

/**
 * The whole WebSocket context: API + status + dynamic JSX in one object.
 *
 * Convenient, but it subscribes the caller to ALL of it — including
 * dynamicJSXContent, which changes on every inbound JSX message. A component
 * using only sendMessage still re-renders at message rate, and an effect keyed
 * on the result re-runs just as often.
 *
 * Prefer the narrow hooks in useWebSocketApi.js when either matters:
 *   useWebSocketApi()    — send/connect/subscribe (stable for a socket)
 *   useWebSocketStatus() — isConnected / isAuthenticated / error / version
 *   useWebSocketJsx()    — dynamicJSXContent
 *
 * This value is now memoized on those three slices, so it no longer changes
 * on every provider render — but it still changes whenever any slice does.
 */
export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (context === undefined) {
        throw new Error('useWebSocket must be used within a WebSocketProvider');
    }
    return context;
};
