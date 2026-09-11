/**
 * Authentication and user identity store.
 *
 * Manages authenticated user state, tenant selection, and merged UI config.
 * Replaces the DISPATCH_USER and related slice of appStateReducer.
 */

import { create } from 'zustand';
import type { UserProfile } from '@/types/state';

interface AuthStore {
  // ── State ──────────────────────────────────────────────────────────────
  isAuthenticated: boolean;
  userInfo: UserProfile | null;
  tenantId: string | null;
  currentTenant: object | null;
  availableTenants: object[];
  needsTenantSelection: boolean;
  /** Set when the session is valid but the identity has no backend access. */
  accessDenied: AccessDenial | null;
  /** Merged UI config: defaults overridden by values from the user profile. */
  uiConfig: Record<string, unknown>;

  // ── Actions ────────────────────────────────────────────────────────────
  /**
   * Set the logged-in user profile.
   * Extracts tenantId from profile.tenant and merges profile.uiConfig on top
   * of existing uiConfig defaults.
   */
  setUserProfile: (profile: UserProfile) => void;

  /** Set the top-level authentication flag. */
  setAuthenticated: (isAuth: boolean) => void;

  /** Replace the full list of tenants available to this user. */
  setTenantsList: (tenants: object[]) => void;

  /**
   * Activate a specific tenant, or reset tenant state by passing null.
   * Sets tenantId and currentTenant, and clears needsTenantSelection
   * (unless a null tenant is passed, in which case only tenant identity
   * is cleared — callers can explicitly flip needsTenantSelection).
   */
  setCurrentTenant: (tenant: (object & { id: string }) | null) => void;

  /** Mark whether the UI should prompt the user to pick a tenant. */
  setNeedsTenantSelection: (needs: boolean) => void;

  /**
   * Record (or clear, with null) an AUTHORIZATION failure — the user's session
   * is valid but the identity holds no access grant, so every gated backend
   * call will be rejected. Distinct from `isAuthenticated: false`, which means
   * "no session" and is resolved by sending the user to log in; re-logging in
   * does NOT fix this one, so it must not trigger a login redirect.
   */
  setAccessDenied: (denial: AccessDenial | null) => void;
}

/**
 * Why a user with a valid session still cannot reach the backend.
 *
 * `no-tenants`  — the session is not linked to any tenant at all.
 * `no-grant`    — linked to a tenant, but holding no ACL grant (auth-go
 *                 reported `authorized: false`). This is the "added to the
 *                 login registry but never granted access" case.
 * `unreachable` — repeated gated-transport failures we could not attribute;
 *                 kept distinct so the UI can offer retry rather than blame.
 */
export type AccessDenialReason = 'no-tenants' | 'no-grant' | 'unreachable';

export interface AccessDenial {
  reason: AccessDenialReason;
  /** Tenant the user was trying to reach, when one was selected. */
  tenantId?: string | null;
  /** Signed-in identity, for "contact your administrator about <email>". */
  email?: string | null;
}

const DEFAULT_UI_CONFIG: Record<string, unknown> = {
  showAppsSidebar: false,
  showWorkspacesSidebar: true,
  showAppsLauncher: true,
  showBackgroundTasks: true,
  showWorkspaceTemplateSelection: true,
  // When true, the left sidebar uses an oversized (70vw) layout while the
  // user hasn't picked a workspace yet — the legacy "workspace-picker
  // takeover" behavior. Default false post chat-first rework so the chat
  // rail can own the screen on a fresh session.
  useWideWorkspacePicker: false,

  chatEnabled: true,
  showChatByDefault: true,
  enableDefaultThreads: true,
  enableThreads: true,
  // "Workspace as thread": hide the thread selector and pin the active chat
  // thread to the current workspace (thread_id === workspace id) — one implicit
  // thread per workspace. Global default here; a workspace can force it on via
  // WorkspaceInfo.mode === 'workspace-as-thread'.
  workspaceAsThread: false,
  // "Workspace-homed threads": chat threads are owned per-workspace (unique per
  // workspace) instead of the user's cross-workspace home. Switching workspaces
  // changes the thread list. Tenant-wide default; a workspace can force it on
  // via WorkspaceInfo.mode === 'workspace-homed-threads'. Combines with the
  // normal thread selector (unlike workspaceAsThread).
  workspaceHomedThreads: false,
  // Offer the "Clear conversation" button for ANY thread, not just the default
  // thread (the default). Pairs with workspaceAsThread so a user can clear the
  // current workspace's chat. The backend clear already accepts any thread_id.
  allowClearAnyThread: false,

  workspacesLabel: 'workspaces',
  applicationsLabel: 'applications',
};

export const useAuthStore = create<AuthStore>((set) => ({
  // ── Initial state ──────────────────────────────────────────────────────
  isAuthenticated: false,
  userInfo: null,
  tenantId: null,
  currentTenant: null,
  availableTenants: [],
  needsTenantSelection: false,
  accessDenied: null,
  uiConfig: { ...DEFAULT_UI_CONFIG },

  // ── Actions ────────────────────────────────────────────────────────────
  setUserProfile: (profile) =>
    set((state) => {
      const { uiConfig: profileUiConfig, ...userInfoWithoutUiConfig } = profile;
      return {
        tenantId: profile.tenant,
        userInfo: userInfoWithoutUiConfig as UserProfile,
        uiConfig: { ...state.uiConfig, ...profileUiConfig },
      };
    }),

  setAuthenticated: (isAuth) => set({ isAuthenticated: isAuth }),

  setTenantsList: (tenants) => set({ availableTenants: tenants }),

  setCurrentTenant: (tenant) =>
    set(
      tenant === null
        ? { tenantId: null, currentTenant: null }
        : {
            tenantId: tenant.id,
            currentTenant: tenant,
            needsTenantSelection: false,
          },
    ),

  setNeedsTenantSelection: (needs) => set({ needsTenantSelection: needs }),

  setAccessDenied: (denial) => set({ accessDenied: denial }),
}));
