/**
 * Typed JSON-RPC 2.0 envelope types and error codes.
 * Conforms to tools-wss PROTOCOL.md.
 */

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

export interface JsonRpcRequest<P = unknown> {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: P;
}

export interface JsonRpcNotification<P = unknown> {
  jsonrpc: '2.0';
  method: string;
  params: P;
  // deliberately no `id`
}

export interface JsonRpcSuccessResponse<R = unknown> {
  jsonrpc: '2.0';
  id: string;
  result: R;
}

export interface JsonRpcErrorObj {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string;
  error: JsonRpcErrorObj;
}

export type JsonRpcResponse<R = unknown> =
  | JsonRpcSuccessResponse<R>
  | JsonRpcErrorResponse;

/** Any incoming message — may be request, response, or notification. */
export type JsonRpcMessage =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | JsonRpcRequest<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | JsonRpcResponse<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | JsonRpcNotification<any>;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return 'id' in msg && ('result' in msg || 'error' in msg);
}

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'id' in msg && 'method' in msg && !('result' in msg) && !('error' in msg);
}

export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return !('id' in msg) && 'method' in msg;
}

export function isErrorResponse(msg: JsonRpcResponse): msg is JsonRpcErrorResponse {
  return 'error' in msg;
}

// ---------------------------------------------------------------------------
// Standard error codes (JSON-RPC 2.0)
// ---------------------------------------------------------------------------

export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // Application-specific (tools-wss PROTOCOL.md §Error Codes)
  ToolNotFound: -32000,
  ToolExecutionFailed: -32001,
  ClientDisconnected: -32002,
  Cancelled: -32003,
  Unauthorized: -32004,
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makeRequest<P>(id: string, method: string, params: P): JsonRpcRequest<P> {
  return { jsonrpc: '2.0', id, method, params };
}

export function makeNotification<P>(method: string, params: P): JsonRpcNotification<P> {
  return { jsonrpc: '2.0', method, params };
}

export function makeSuccessResponse<R>(id: string, result: R): JsonRpcSuccessResponse<R> {
  return { jsonrpc: '2.0', id, result };
}

export function makeErrorResponse(
  id: string,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}
