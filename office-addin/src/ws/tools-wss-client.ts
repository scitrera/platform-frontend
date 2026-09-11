/**
 * ToolsWssClient — JSON-RPC 2.0 over native WebSocket.
 *
 * IMPORTANT: Browser WebSocket API does not support custom request headers.
 * The tools-wss server authenticates via an `Authorization: Bearer <jwt>`
 * HTTP header during the upgrade handshake. Because the browser cannot set
 * this header, we append the JWT as a `?access_token=<jwt>` query parameter
 * as a fallback. This fallback is fully supported server-side:
 * `internal/server/auth.go` reads `r.URL.Query().Get("access_token")` when
 * the `Authorization` header is absent and synthesizes the Bearer header
 * before passing the request to the auth middleware.
 *
 * SECURITY NOTE: tokens-in-URL can appear in server access logs and browser
 * history. Mitigations: (a) tokens are short-lived (NAA / MSAL TTLs), and
 * (b) the server should avoid logging the full upgrade URL in production.
 * A future improvement is to move the token into the Sec-WebSocket-Protocol
 * subprotocol header, which browsers do support, to avoid URL exposure.
 *
 * Conforms to PROTOCOL.md.
 */

import type {
  ChatMessage as SpecChatMessage,
  ExecutionBinding,
  WorkspaceViewDescriptor,
} from '@scitrera/messaging-spec';

import { generateUUID } from '../lib/utils';
import {
  ErrorCodes,
  isErrorResponse,
  isNotification,
  isRequest,
  isResponse,
  JsonRpcMessage,
  makeErrorResponse,
  makeNotification,
  makeRequest,
  makeSuccessResponse,
} from './jsonrpc';

// ---------------------------------------------------------------------------
// Domain types (derived from PROTOCOL.md)
// ---------------------------------------------------------------------------

/** A single workspace visible to the authenticated user. */
export interface WorkspaceInfo {
  id: string;
  name: string;
}

/** Result shape for the workspaces/list JSON-RPC call. */
export interface WorkspacesListResult {
  workspaces: WorkspaceInfo[];
}

export interface WorkspaceViewsListParams {
  workspace: string;
  limit?: number;
  page_token?: string;
}

export interface WorkspaceViewsListResult {
  workspace_id: string;
  views: WorkspaceViewDescriptor[];
  next_page_token?: string;
}

export interface WorkspaceExecutionHost {
  binding: ExecutionBinding;
  capabilities: string[];
  observed_at: string;
  expires_at?: string;
  vcs?: {
    kind?: string;
    repository_id?: string;
    worktree_id?: string;
    head_revision?: string;
    branch?: string;
    dirty?: boolean;
    detached?: boolean;
  };
}

export interface WorkspaceViewHostsListParams {
  workspace: string;
  view_id: string;
  limit?: number;
  page_token?: string;
}

export interface WorkspaceViewHostsListResult {
  workspace_id: string;
  view_id: string;
  hosts: WorkspaceExecutionHost[];
  next_page_token?: string;
}

/** Result shape for the chat/send JSON-RPC call. */
export interface ChatSendResult {
  message_id: string;
  task_id: string;
}

/** Canonical spec-native parameters for a Sahara chat turn. */
export interface ChatSendParams {
  thread_id: string;
  workspace: string;
  message: SpecChatMessage;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'auth-failed';

export type ClientEvent =
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'
  | 'auth-failed';

export type RequestHandler = (params: unknown, requestId: string) => Promise<unknown>;
export type NotificationHandler = (params: unknown) => void;

export interface ToolsWssClientOptions {
  url: string;
  /** Must return a fresh JWT. Called on every connect/reconnect. */
  getToken: () => Promise<string>;
  /** Called when the server replies with error code -32004 (Unauthorized). */
  onTokenExpired?: () => void;
  /** Per-call timeout in milliseconds. Default: 60 000. */
  callTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PendingCall {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ToolsWssClient {
  private readonly options: Required<ToolsWssClientOptions>;

  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';

  /** Pending client→server calls waiting for a response. */
  private pendingCalls = new Map<string, PendingCall>();

  /** Handlers for server-initiated requests (method → handler). */
  private requestHandlers = new Map<string, RequestHandler>();

  /** Handlers for incoming notifications (method → Set<handler>). */
  private notificationHandlers = new Map<string, Set<NotificationHandler>>();

  /** Typed event listeners. */
  private eventListeners = new Map<ClientEvent, Set<() => void>>();

  /** Reconnect state */
  private reconnectAttempt = 0;
  private readonly maxBackoffMs = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private explicitClose = false;

  constructor(options: ToolsWssClientOptions) {
    this.options = {
      onTokenExpired: () => undefined,
      callTimeoutMs: 60_000,
      ...options,
    };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Open the WebSocket connection. Safe to call multiple times. */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    this.explicitClose = false;
    await this._openSocket();
  }

  /** Close the connection permanently (no reconnect). */
  close(): void {
    this.explicitClose = true;
    this._clearReconnectTimer();
    this.ws?.close(1000, 'client close');
    this._setState('disconnected');
  }

  /**
   * Make a JSON-RPC call (client → server).
   * Returns the `result` field on success; throws on timeout or error response.
   */
  async call<R = unknown>(method: string, params: unknown): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`Cannot call ${method}: WebSocket not connected`));
        return;
      }

      const id = generateUUID();

      const timer = setTimeout(() => {
        this.pendingCalls.delete(id);
        reject(new Error(`JSON-RPC call timed out: ${method} (id=${id})`));
      }, this.options.callTimeoutMs);

      this.pendingCalls.set(id, {
        resolve: (r) => resolve(r as R),
        reject,
        timer,
      });

      const msg = makeRequest(id, method, params);
      this.ws.send(JSON.stringify(msg));
    });
  }

  // -------------------------------------------------------------------------
  // Typed domain helpers
  // -------------------------------------------------------------------------

  /**
   * List workspaces available to the authenticated user.
   * Calls the `workspaces/list` JSON-RPC method.
   */
  listWorkspaces(): Promise<WorkspacesListResult> {
    return this.call<WorkspacesListResult>('workspaces/list', {});
  }

  listWorkspaceViews(params: WorkspaceViewsListParams): Promise<WorkspaceViewsListResult> {
    return this.call<WorkspaceViewsListResult>('workspace_views/list', params);
  }

  listWorkspaceViewHosts(
    params: WorkspaceViewHostsListParams,
  ): Promise<WorkspaceViewHostsListResult> {
    return this.call<WorkspaceViewHostsListResult>('workspace_views/list_hosts', params);
  }

  /**
   * Send a chat message to the current thread.
   * Calls the `chat/send` JSON-RPC method.
   */
  chatSend(params: ChatSendParams): Promise<ChatSendResult> {
    return this.call<ChatSendResult>('chat/send', params);
  }

  /**
   * Cancel a running agent task.
   * Calls the `chat/cancel` JSON-RPC method.
   */
  chatCancel(taskId: string): Promise<void> {
    return this.call<void>('chat/cancel', { task_id: taskId });
  }

  /**
   * Send a JSON-RPC notification (client → server).
   * Fire-and-forget; no id, no response expected.
   */
  notify(method: string, params: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = makeNotification(method, params);
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Register a handler for server-initiated requests.
   * One handler per method; calling again replaces the previous handler.
   * The client automatically wraps the handler result (or thrown error) in a
   * JSON-RPC response before sending it back to the server.
   */
  setRequestHandler(method: string, handler: RequestHandler): void {
    this.requestHandlers.set(method, handler);
  }

  /**
   * Register a handler for incoming server notifications.
   * Multiple handlers per method are allowed (fan-out).
   */
  setNotificationHandler(method: string, handler: NotificationHandler): void {
    const set = this.notificationHandlers.get(method) ?? new Set();
    set.add(handler);
    this.notificationHandlers.set(method, set);
  }

  /** Remove a previously registered notification handler. */
  removeNotificationHandler(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.get(method)?.delete(handler);
  }

  /** Current connection state. */
  getState(): ConnectionState {
    return this.state;
  }

  // -------------------------------------------------------------------------
  // Event emitter (simple, typed)
  // -------------------------------------------------------------------------

  addEventListener(event: ClientEvent, listener: () => void): void {
    const set = this.eventListeners.get(event) ?? new Set();
    set.add(listener);
    this.eventListeners.set(event, set);
  }

  removeEventListener(event: ClientEvent, listener: () => void): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  private _emit(event: ClientEvent): void {
    this.eventListeners.get(event)?.forEach((fn) => fn());
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  private async _openSocket(): Promise<void> {
    let token: string;
    try {
      token = await this.options.getToken();
    } catch (err) {
      console.error('[ToolsWssClient] Failed to acquire token:', err);
      this._emit('auth-failed');
      this._setState('auth-failed');
      return;
    }

    // Append JWT as query param because the browser WebSocket API cannot set
    // custom HTTP headers. The tools-wss server supports this fallback —
    // see the auth note at the top of this file.
    const url = new URL(this.options.url);
    url.searchParams.set('access_token', token);

    this._setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(url.toString());
    } catch (err) {
      console.error('[ToolsWssClient] WebSocket constructor threw:', err);
      this._scheduleReconnect();
      return;
    }

    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this._setState('connected');
      this._emit('connected');
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      this._handleMessage(event.data);
    };

    ws.onerror = (event) => {
      console.error('[ToolsWssClient] WebSocket error', event);
      this._emit('error');
    };

    ws.onclose = (event: CloseEvent) => {
      this._rejectAllPending('WebSocket closed');
      this._setState('disconnected');
      this._emit('disconnected');

      // 4001/4003: auth failure — do not reconnect automatically.
      if (event.code === 4001 || event.code === 4003 || event.code === 1008) {
        console.warn('[ToolsWssClient] Auth-level close code:', event.code);
        this._emit('auth-failed');
        this._setState('auth-failed');
        this.options.onTokenExpired();
        return;
      }

      if (!this.explicitClose) {
        this._scheduleReconnect();
      }
    };
  }

  private _scheduleReconnect(): void {
    if (this.explicitClose) return;
    this._clearReconnectTimer();

    const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempt), this.maxBackoffMs);
    this.reconnectAttempt += 1;

    console.info(
      `[ToolsWssClient] Reconnecting in ${backoff}ms (attempt ${this.reconnectAttempt})`,
    );
    this._setState('reconnecting');
    this._emit('reconnecting');

    this.reconnectTimer = setTimeout(() => {
      void this._openSocket();
    }, backoff);
  }

  private _clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _setState(state: ConnectionState): void {
    this.state = state;
  }

  // -------------------------------------------------------------------------
  // Message dispatch
  // -------------------------------------------------------------------------

  private _handleMessage(raw: string): void {
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(raw) as JsonRpcMessage;
    } catch {
      console.warn('[ToolsWssClient] Failed to parse message:', raw);
      return;
    }

    if (isResponse(msg)) {
      this._handleResponse(msg);
    } else if (isRequest(msg)) {
      // Server-initiated request — dispatch to registered handler.
      void this._handleServerRequest(msg);
    } else if (isNotification(msg)) {
      this._handleNotification(msg);
    }
  }

  private _handleResponse(msg: JsonRpcMessage): void {
    if (!isResponse(msg)) return;
    const id = msg.id;
    const pending = this.pendingCalls.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingCalls.delete(id);

    if (isErrorResponse(msg)) {
      // Detect auth expiry (server pushed Unauthorized post-upgrade).
      if (msg.error.code === ErrorCodes.Unauthorized) {
        this.options.onTokenExpired();
        this._emit('auth-failed');
      }
      pending.reject(
        new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`),
      );
    } else {
      pending.resolve(msg.result);
    }
  }

  private async _handleServerRequest(msg: { id: string; method: string; params: unknown }): Promise<void> {
    const handler = this.requestHandlers.get(msg.method);
    if (!handler) {
      this._sendRaw(
        makeErrorResponse(msg.id, ErrorCodes.MethodNotFound, `Method not found: ${msg.method}`),
      );
      return;
    }

    try {
      const result = await handler(msg.params, msg.id);
      this._sendRaw(makeSuccessResponse(msg.id, result));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._sendRaw(
        makeErrorResponse(msg.id, ErrorCodes.ToolExecutionFailed, 'Tool execution failed', message),
      );
    }
  }

  private _handleNotification(msg: { method: string; params: unknown }): void {
    const handlers = this.notificationHandlers.get(msg.method);
    if (!handlers || handlers.size === 0) return;
    handlers.forEach((fn) => {
      try {
        fn(msg.params);
      } catch (err) {
        console.error(`[ToolsWssClient] Notification handler error for ${msg.method}:`, err);
      }
    });
  }

  private _sendRaw(obj: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private _rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingCalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`${reason} (id=${id})`));
    }
    this.pendingCalls.clear();
  }
}
