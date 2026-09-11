/**
 * WebSocket message type constants and TypeScript interfaces.
 *
 * Mirrors WebSocketConstants.jsx but with full type safety.
 * New code should import from here; legacy JSX code continues
 * using WebSocketConstants.jsx until migrated.
 */

// ─── Message Type Constants ──────────────────────────────────────────

export const WS_DYNAMIC_JSX = {
  CONTENT: 'DYNAMIC_JSX_CONTENT',
  UPDATE: 'JSX_UPDATE',
} as const;

export const WS_CUSTOM_COMPONENTS = {
  SIDEBAR: '_sidebar',
  PLACEHOLDER: '_placeholder',
} as const;

export const WS_CHAT = {
  HISTORY: 'GET_CHAT_HISTORY',
  CLEAR: 'CHAT_CLEAR',
  APPEND_MESSAGE: 'CHAT_MESSAGE',
  APPEND_TOKENS: 'CHAT_TOKENS',
  FILE_UPLOAD_POST: 'FILE_UPLOAD_POST',
  FILE_METADATA_GET: 'FILE_METADATA_GET',
  FILE_DOWNLOAD_GET: 'FILE_DOWNLOAD_GET',
  CHAT_PROGRESS: 'CHAT_PROGRESS',
  FEEDBACK: 'CHAT_FEEDBACK',
  EDIT_MESSAGE: 'CHAT_EDIT',
  THREAD_ADD: 'CT_ADD',
  THREAD_RENAME: 'CT_RENAME',
  THREAD_DELETE: 'CT_DELETE',
  THREAD_LIST: 'CT_LIST',
  THREAD_SEARCH: 'CT_SEARCH',
} as const;

export const WS_USER = {
  GET_PROFILE: 'GET_USER_PROFILE',
  SWITCH_TENANT: 'SWITCH_TENANT',
  TOOL_CALL: 'TOOL_CALL',
  APP_PROGRESS: 'APP_PROGRESS',
} as const;

export const WS_AGENT = {
  TOOL_CALL: 'AGENT_TOOL_CALL',
  TOOL_RESULT: 'AGENT_TOOL_RESULT',
  TOOL_CATALOG: 'AGENT_TOOL_CATALOG',
} as const;

export interface AgentToolCallPayload {
  toolName: string;
  args?: Record<string, unknown>;
  /** Present when the agent expects an AGENT.TOOL_RESULT reply. */
  callId?: string;
}

export interface AgentToolResultPayload {
  callId: string;
  result?: unknown;
  error?: string;
}

export const WS_WORKSPACE = {
  GET_WORKSPACES: 'GET_WORKSPACES',
  GET_APPLICATIONS: 'GET_APPS',
  GET_BACKGROUND_TASKS: 'GET_BACKGROUND_TASKS',
  TOAST: 'TOAST',
  CREATE_WORKSPACE: 'WS_CREATE',
  LIST_MEMBERS: 'WS_LIST_SHARE',
  SHARE: 'WS_SHARE',
  UNSHARE: 'WS_UNSHARE',
  DELETE: 'WS_DELETE',
  DP_ADD: 'DP_ADD',
  DP_EDIT: 'DP_EDIT',
  DP_DELETE: 'DP_DELETE',
  DP_TEST: 'DP_TEST',
  DP_PATH: 'DP_PATH',
  MF_SEARCH: 'MF_SEARCH',
  TN_LIST_USERS: 'TN_LIST_USERS',
} as const;

export const WS_CONNECTION = {
  PING: 'PING',
  RPC_MESSAGE: 'RPC',
  RPC_EXCEPTION: 'RPX',
} as const;

// ─── Message Payload Interfaces ──────────────────────────────────────

export interface ChatMessage {
  timestamp: number;
  sender: 'user' | 'assistant';
  text: string;
}

export interface ChatHistoryPayload {
  workspace: string;
  threadId?: string | null;
  messages: ChatMessage[];
}

export interface ChatTokensPayload {
  text: string;
  end: boolean;
  sender: 'assistant';
  threadId?: string | null;
  timestamp: number;
}

export interface ChatProgressPayload {
  name: string;
  message?: string;
  step?: Record<string, unknown>;
  exc_msg?: string;
  dynamic?: Record<string, unknown>;
  threadId?: string | null;
}

export interface AppProgressPayload {
  id: string;
  app: string;
  agent: string;
  status: 'running' | 'failed' | 'completed';
  progress?: number;
  name: string;
  message?: string;
  step?: Record<string, unknown>;
  exc_msg?: string;
  dynamic?: Record<string, unknown>;
}

export interface ToolCallPayload {
  [key: string]: unknown;
}

export interface DynamicJSXPayload {
  componentId: string;
  jsxTemplate?: string;
  contextData?: Record<string, unknown>;
}

// ─── RPC Types ───────────────────────────────────────────────────────

export interface RpcRequest {
  id: string;
  type: string;
  payload: unknown;
}

export interface RpcResponse {
  id: string;
  type: string;
  payload: unknown;
  error?: string;
}

/** Pending RPC request with resolve/reject for promise-based usage */
export interface PendingRpcRequest {
  id: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// ─── WebSocket Envelope ──────────────────────────────────────────────

export interface WSMessage {
  type: string;
  payload: unknown;
}

export interface WSEmitOptions {
  timeout?: number;
}
