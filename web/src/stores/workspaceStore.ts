/**
 * Workspace navigation and background-task store.
 *
 * Manages the workspace tree, the active workspace, available applications,
 * and running background tasks.
 * Replaces the DISPATCH_WORKSPACES slice of appStateReducer.
 */

import { create } from 'zustand';
import type { AppInfo, BackgroundTask, WorkspaceInfo, WorkspaceNav } from '@/types/state';
import { DEFAULT_APPS } from '@/constants/AppConstants';
import { parseUrlPath } from '@/utils/urlUtils.js';
import { useAppPanelStore } from './appPanelStore';
import { useUIStore } from './uiStore';
import { useChatRailStore } from './chatRailStore';

interface WorkspaceStore {
  // ── State ──────────────────────────────────────────────────────────────
  workspaces: WorkspaceNav;
  currentWorkspaceId: string | null;
  currentWorkspaceInfo: WorkspaceInfo | null;
  availableApps: AppInfo[];
  backgroundTasks: BackgroundTask[];
  isLoadingWorkspaces: boolean;

  // ── Actions ────────────────────────────────────────────────────────────
  /**
   * Replace the full workspace tree.
   * Also refreshes currentWorkspaceInfo when a currentWorkspaceId is already set.
   */
  setWorkspaces: (data: WorkspaceNav) => void;

  /**
   * Switch the active workspace by ID.
   * Looks up workspace metadata from the stored workspace lists, resets the
   * sidebar to collapsed, clears panels (or installs the chat default), and
   * reads URL query/hash/path parameters into the appPanelStore.
   * Pass null to deselect.
   *
   * NOTE: URL writes are performed separately by useURLSync.
   */
  setCurrentWorkspace: (id: string | null) => void;

  /**
   * Set the active workspace using an explicit WorkspaceInfo object,
   * bypassing the lookup in the stored workspace lists.
   * Also pulls URL query/hash/path into the appPanelStore.
   */
  setCurrentWorkspaceCustom: (data: WorkspaceInfo) => void;

  /**
   * Rename a workspace in the cached tree (optimistic local update). Updates
   * the label across all lists and refreshes currentWorkspaceInfo if it's the
   * one being renamed. Does NOT send anything to the server.
   */
  renameWorkspace: (id: string, label: string) => void;

  /**
   * Remove a workspace from the cached tree (optimistic local update). If it
   * was the current workspace, clears the current workspace (which resets the
   * panels to the select-workspace prompt). Does NOT send anything to the server.
   */
  removeWorkspace: (id: string) => void;

  /** Replace the list of applications available in the current workspace. */
  setApplications: (apps: AppInfo[]) => void;

  /** Replace the full list of background tasks. */
  setBackgroundTasks: (tasks: BackgroundTask[]) => void;

  /**
   * Merge an update into an existing background task identified by id.
   * No-op if no task with that id exists.
   */
  updateBackgroundTask: (task: Partial<BackgroundTask> & { id: string }) => void;

  /**
   * Add a new background task.
   * If a task with the same id already exists it is merged (upsert behaviour).
   */
  addBackgroundTask: (task: BackgroundTask) => void;

  /**
   * Remove a background task by id.
   * Used to expire terminal (completed/failed) tasks from the live feed after
   * a short client-side delay. No-op if no task with that id exists.
   */
  removeBackgroundTask: (id: string) => void;

  /** Set the workspace-list loading flag. */
  setLoadingWorkspaces: (loading: boolean) => void;
}

const EMPTY_WORKSPACES: WorkspaceNav = {
  shared: [],
  private: [],
  hidden: [],
  templates: [],
};

/** Look up a WorkspaceInfo across all lists in a WorkspaceNav. */
export function findWorkspace(
  workspaces: WorkspaceNav,
  id: string,
): WorkspaceInfo | undefined {
  return (
    workspaces.hidden?.find((ws) => ws.id === id) ||
    workspaces.shared?.find((ws) => ws.id === id) ||
    workspaces.private?.find((ws) => ws.id === id) ||
    workspaces.templates?.find((ws) => ws.id === id)
  );
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  // ── Initial state ──────────────────────────────────────────────────────
  workspaces: { ...EMPTY_WORKSPACES },
  currentWorkspaceId: null,
  currentWorkspaceInfo: null,
  availableApps: [],
  backgroundTasks: [],
  isLoadingWorkspaces: false,

  // ── Actions ────────────────────────────────────────────────────────────
  setWorkspaces: (data) =>
    set((state) => ({
      workspaces: data,
      isLoadingWorkspaces: false,
      currentWorkspaceInfo:
        state.currentWorkspaceId !== null
          ? (findWorkspace(data, state.currentWorkspaceId) ?? null)
          : null,
    })),

  setCurrentWorkspace: (id) => {
    const hasWorkspace = !!id;

    set((state) => ({
      currentWorkspaceId: id,
      currentWorkspaceInfo:
        id !== null ? (findWorkspace(state.workspaces, id) ?? null) : null,
    }));

    // Reset sidebar to collapsed whenever the workspace changes.
    useUIStore.getState().toggleSidebar(true);

    // Pull URL-derived params so the panels reflect the current URL.
    const { appPath, queryParams, hashParams } = parseUrlPath();

    // Chat is now a user-scoped rail mounted outside AppArea; no longer
    // installed into the secondary panel on workspace switch.
    const main = hasWorkspace
      ? null
      : (DEFAULT_APPS.DEFAULT_SELECT_WORKSPACE_APP as AppInfo);

    useAppPanelStore.getState()._setPanels({
      main,
      secondary: null,
      appSplit: 100,
      appPath,
      appQueryParams: queryParams || null,
      appHash: hashParams || null,
    });

    // Chat rail visibility on workspace switch:
    //   - '_tenant' is the admin/settings pseudo-workspace; collapse chat
    //     by default since it's not a conversational surface.
    //   - Any other workspace: expand chat if collapsed so the user doesn't
    //     land on an empty AppArea backdrop. expand() is a no-op when the
    //     rail is already 'sidebar' or 'fullscreen'.
    if (hasWorkspace) {
      if (id === '_tenant') {
        useChatRailStore.getState().setState('collapsed');
      } else {
        useChatRailStore.getState().expand();
      }
    }
  },

  setCurrentWorkspaceCustom: (data) => {
    if (!data || !data.id || !data.label) {
      return;
    }

    set({
      currentWorkspaceId: data.id,
      currentWorkspaceInfo: data,
    });

    // Pull URL-derived params so the panels reflect the current URL.
    const { appPath, queryParams, hashParams } = parseUrlPath();
    useAppPanelStore.getState()._setPanels({
      appPath,
      appQueryParams: queryParams || null,
      appHash: hashParams || null,
    });
  },

  renameWorkspace: (id, label) =>
    set((state) => {
      const relabel = (list: WorkspaceInfo[]) =>
        list.map((ws) => (ws.id === id ? { ...ws, label } : ws));
      return {
        workspaces: {
          shared: relabel(state.workspaces.shared),
          private: relabel(state.workspaces.private),
          hidden: relabel(state.workspaces.hidden),
          templates: relabel(state.workspaces.templates),
        },
        currentWorkspaceInfo:
          state.currentWorkspaceId === id && state.currentWorkspaceInfo
            ? { ...state.currentWorkspaceInfo, label }
            : state.currentWorkspaceInfo,
      };
    }),

  removeWorkspace: (id) => {
    const wasCurrent = useWorkspaceStore.getState().currentWorkspaceId === id;
    set((state) => {
      const drop = (list: WorkspaceInfo[]) => list.filter((ws) => ws.id !== id);
      return {
        workspaces: {
          shared: drop(state.workspaces.shared),
          private: drop(state.workspaces.private),
          hidden: drop(state.workspaces.hidden),
          templates: drop(state.workspaces.templates),
        },
      };
    });
    // Clearing the current workspace resets the panels to the select-workspace
    // prompt, so a just-deleted workspace never stays "open".
    if (wasCurrent) {
      useWorkspaceStore.getState().setCurrentWorkspace(null);
    }
  },

  setApplications: (apps) => set({ availableApps: apps }),

  setBackgroundTasks: (tasks) => set({ backgroundTasks: tasks }),

  updateBackgroundTask: (task) =>
    set((state) => ({
      backgroundTasks: state.backgroundTasks.map((t) =>
        t.id === task.id ? { ...t, ...task } : t,
      ),
    })),

  addBackgroundTask: (task) =>
    set((state) => {
      const idx = state.backgroundTasks.findIndex((t) => t.id === task.id);
      if (idx > -1) {
        const next = [...state.backgroundTasks];
        next[idx] = { ...next[idx], ...task };
        return { backgroundTasks: next };
      }
      return { backgroundTasks: [...state.backgroundTasks, task] };
    }),

  removeBackgroundTask: (id) =>
    set((state) => {
      const next = state.backgroundTasks.filter((t) => t.id !== id);
      if (next.length === state.backgroundTasks.length) return {};
      return { backgroundTasks: next };
    }),

  setLoadingWorkspaces: (loading) => set({ isLoadingWorkspaces: loading }),
}));
