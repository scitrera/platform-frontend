/**
 * Connection state helpers — thin wrappers used by ChatApp to map
 * ToolsWssClient events → ChatState ConnectionState values.
 */
import type { ConnectionState } from './chat';
import type { ClientEvent } from '../ws/tools-wss-client';

/** Map a ToolsWssClient ClientEvent to a ChatState ConnectionState. */
export function clientEventToConnectionState(event: ClientEvent): ConnectionState | null {
  switch (event) {
    case 'connected':
      return 'connected';
    case 'reconnecting':
      return 'reconnecting';
    case 'disconnected':
      return 'offline';
    case 'auth-failed':
      return 'auth-required';
    case 'error':
      return null; // Don't change state on generic error events
    default:
      return null;
  }
}
