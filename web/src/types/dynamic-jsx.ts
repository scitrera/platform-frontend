/**
 * Type definitions for the Dynamic JSX rendering system.
 *
 * The DynamicJSXRenderer executes JSX code sent by backend agents in a
 * sandboxed react-live environment. This file defines the scope contract:
 * what variables, components, and functions are available to dynamic JSX.
 *
 * Backend JSX template authors should reference these types to understand
 * what's available in the scope.
 */

// ─── Scope Context (injected by DynamicJSXRenderer) ──────────────────

export interface DynamicJSXContext {
  /** Current workspace ID */
  workspace: string;
  /** Current user ID */
  currentUserId: string;
  /** Current user email */
  currentUserEmail: string;
  /** Current user's role in the workspace */
  currentUserRole: string;
  /** Primary app ID */
  appId: string;
  /** Secondary app ID (if split view) */
  app2Id?: string;
  /** Component ID within the app */
  componentId: string;
  /** Query parameters from the app URL */
  appQueryParams: Record<string, string>;
}

// ─── RPC Tools (available in JSX scope) ──────────────────────────────

export interface RpcToolCall {
  /**
   * Make an RPC call to the backend via WebSocket.
   * Returns a promise that resolves with the backend response.
   */
  (toolName: string, args?: Record<string, unknown>): Promise<unknown>;
}

export interface NavigationTools {
  /** Navigate to a different app within the current workspace */
  navigateToApp: (appId: string, params?: Record<string, string>) => void;
  /** Navigate to a different workspace */
  navigateToWorkspace: (workspaceId: string) => void;
  /** Open a URL in a new tab */
  openExternal: (url: string) => void;
}

// ─── Available Components in JSX Scope ───────────────────────────────

/**
 * Components available to dynamic JSX templates.
 * These are injected into the react-live scope.
 */
export interface DynamicJSXComponents {
  // UI Primitives
  Button: React.ComponentType<Record<string, unknown>>;
  Card: React.ComponentType<Record<string, unknown>>;
  Badge: React.ComponentType<Record<string, unknown>>;
  Input: React.ComponentType<Record<string, unknown>>;
  Dialog: React.ComponentType<Record<string, unknown>>;
  Select: React.ComponentType<Record<string, unknown>>;

  // Domain Widgets
  GenericTable: React.ComponentType<Record<string, unknown>>;
  Spreadsheet: React.ComponentType<Record<string, unknown>>;
  DocumentImageViewer: React.ComponentType<Record<string, unknown>>;
  DocMatrix: React.ComponentType<Record<string, unknown>>;
  FileUpload: React.ComponentType<Record<string, unknown>>;
  TaskStatusCard: React.ComponentType<Record<string, unknown>>;
}

// ─── Full Scope (everything available in dynamic JSX) ────────────────

export interface DynamicJSXScope extends DynamicJSXComponents {
  // React hooks (typed as any since react-live injects them dynamically)
  React: unknown;
  useState: (...args: unknown[]) => unknown;
  useEffect: (...args: unknown[]) => unknown;
  useCallback: (...args: unknown[]) => unknown;
  useMemo: (...args: unknown[]) => unknown;
  useRef: (...args: unknown[]) => unknown;

  // Context data
  context: DynamicJSXContext;

  // RPC and navigation
  rpcToolCall: RpcToolCall;
  navigation: NavigationTools;
}

// ─── Scope Version ───────────────────────────────────────────────────

/**
 * Scope version — increment when breaking changes are made to the scope.
 * Backend can query this to know what's available.
 */
export const DYNAMIC_JSX_SCOPE_VERSION = 2;
