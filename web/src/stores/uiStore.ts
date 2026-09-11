/**
 * UI interaction store.
 *
 * Manages transient UI state: sidebar visibility, dropdown open/closed state,
 * and modal visibility. No persistence — state resets on page load.
 *
 * Replaces the INTERACTIONS slice of appStateReducer.
 */

import { create } from 'zustand';
import type { SidebarMode } from '@/types/state';

interface UIStore {
  // ── State ──────────────────────────────────────────────────────────────
  sidebarCollapsed: boolean;
  sidebarMode: SidebarMode;
  progressPanelOpen: boolean;
  appsLauncherOpen: boolean;
  avatarMenuOpen: boolean;
  createWorkspaceModalOpen: boolean;
  /** Whether a tenant/workspace-provided custom sidebar is enabled. */
  isCustomSidebarEnabled: boolean;
  /** Whether the custom sidebar is fully loaded and ready. */
  isCustomSidebarReady: boolean;

  // ── Actions ────────────────────────────────────────────────────────────
  /**
   * Toggle the sidebar collapsed state.
   * When `force` is provided, sets the state directly instead of toggling.
   */
  toggleSidebar: (force?: boolean) => void;

  /** Set the sidebar display mode (applications list or workspaces list). */
  setSidebarMode: (mode: SidebarMode) => void;

  /**
   * Toggle the progress panel.
   * Closes appsLauncher and avatarMenu as a side effect.
   */
  toggleProgressPanel: () => void;

  /**
   * Toggle the apps launcher dropdown.
   * Closes progressPanel and avatarMenu as a side effect.
   */
  toggleAppsLauncher: () => void;

  /**
   * Toggle the avatar menu dropdown.
   * Closes progressPanel and appsLauncher as a side effect.
   */
  toggleAvatarMenu: () => void;

  /** Close all three dropdowns (progressPanel, appsLauncher, avatarMenu). */
  closeAllDropdowns: () => void;

  /** Open or close the Create Workspace modal. */
  setCreateWorkspaceModalOpen: (open: boolean) => void;

  /** Enable/disable the custom sidebar mode. */
  setCustomSidebarEnabled: (enabled: boolean) => void;

  /** Mark custom sidebar ready / not-ready. */
  setCustomSidebarReady: (ready: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  // ── Initial state ──────────────────────────────────────────────────────
  sidebarCollapsed: true,
  sidebarMode: 'applications',
  progressPanelOpen: false,
  appsLauncherOpen: false,
  avatarMenuOpen: false,
  createWorkspaceModalOpen: false,
  isCustomSidebarEnabled: false,
  isCustomSidebarReady: false,

  // ── Actions ────────────────────────────────────────────────────────────
  toggleSidebar: (force) =>
    set((state) => ({
      sidebarCollapsed: force !== undefined ? force : !state.sidebarCollapsed,
    })),

  setSidebarMode: (mode) => set({ sidebarMode: mode }),

  toggleProgressPanel: () =>
    set((state) => ({
      progressPanelOpen: !state.progressPanelOpen,
      appsLauncherOpen: false,
      avatarMenuOpen: false,
    })),

  toggleAppsLauncher: () =>
    set((state) => ({
      appsLauncherOpen: !state.appsLauncherOpen,
      progressPanelOpen: false,
      avatarMenuOpen: false,
    })),

  toggleAvatarMenu: () =>
    set((state) => ({
      avatarMenuOpen: !state.avatarMenuOpen,
      progressPanelOpen: false,
      appsLauncherOpen: false,
    })),

  closeAllDropdowns: () =>
    set({
      progressPanelOpen: false,
      appsLauncherOpen: false,
      avatarMenuOpen: false,
    }),

  setCreateWorkspaceModalOpen: (open) =>
    set({ createWorkspaceModalOpen: open }),

  setCustomSidebarEnabled: (enabled) =>
    set({ isCustomSidebarEnabled: enabled }),

  setCustomSidebarReady: (ready) => set({ isCustomSidebarReady: ready }),
}));
