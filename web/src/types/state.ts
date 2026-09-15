/**
 * Application state type definitions.
 *
 * Defines the shape of global state used across the app.
 * Used by the Zustand stores (authStore, workspaceStore, appPanelStore, uiStore).
 */

// ─── User & Auth ─────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  tenant: string;
  permissions: {
    isTenantAdmin: boolean;
    isSuperAdmin: boolean;
    canCreateWorkspaces: boolean;
  };
  uiConfig: Record<string, unknown>;
  tenants: string[];
}

export type AuthState = 'unknown' | 'authenticated' | 'unauthenticated';

// ─── Workspaces ──────────────────────────────────────────────────────

export type WorkspaceRole = 'read' | 'rw' | 'rw+' | 'admin';

export interface WorkspaceInfo {
  id: string;
  label: string;
  role: WorkspaceRole;
  default_app?: string | null;
  mode?: string | null;
}

export interface WorkspaceNav {
  shared: WorkspaceInfo[];
  private: WorkspaceInfo[];
  hidden: WorkspaceInfo[];
  templates: WorkspaceInfo[];
}

// ─── Applications ────────────────────────────────────────────────────

export interface AppInfo {
  id: string;
  name?: string;
  title?: string;
  icon?: string | null;
  mode?: string | null;
  iframe?: string | null;
  type?: string;
  /** Explicit header X visibility; omitted uses workspace/panel defaults. */
  closeable?: boolean;
  /** Secondary pane belongs to this main app and is removed when it leaves. */
  ownerAppId?: string;
  onClose?: () => void;
}

export type AppLayout = 'horizontal' | 'vertical';

// ─── Background Tasks ────────────────────────────────────────────────

export type TaskClass = 'background' | 'batch' | null;

export interface BackgroundTask {
  id: string;
  workspace: string;
  app: string;
  /** Present on live APP_PROGRESS events; absent on the snapshot RPC. */
  agent?: string;
  user?: string;
  created_at?: number;
  updated_at: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
  progress?: number | null;
  name: string;
  message?: string;
  step?: Record<string, unknown>;
  exc_msg?: string;
  dynamic?: Record<string, unknown>;
  /**
   * APP_PROGRESS scheduling class. 'background' = connector/system ingest
   * (hidden in the panel), 'batch' = user-initiated (shown), null = legacy
   * single-app dashboard sender. Snapshot RPC entries omit this (server
   * already excludes BACKGROUND-class tasks).
   */
  task_class?: TaskClass;
  /** Background-task subtype discriminator, e.g. 'ingest'. */
  bg_kind?: string | null;
}

// ─── Chat Threads ────────────────────────────────────────────────────

export interface ChatThread {
  id: string;
  name: string;
  lastActivity: number;
}

// ─── UI State ────────────────────────────────────────────────────────

export type SidebarMode = 'applications' | 'workspaces';

export interface UIState {
  sidebarCollapsed: boolean;
  sidebarMode: SidebarMode;
  appLayout: AppLayout;
  progressPanelOpen: boolean;
  appsLauncherOpen: boolean;
  avatarMenuOpen: boolean;
  createWorkspaceModalOpen: boolean;
  appSplitPct: number;
}

// ─── Permissions ─────────────────────────────────────────────────────

export type Permission = 'READ' | 'RW' | 'RW_PLUS' | 'ADMIN';

export const PERMISSION_LEVELS: Record<Permission, number> = {
  READ: 10,
  RW: 20,
  RW_PLUS: 30,
  ADMIN: 40,
};
