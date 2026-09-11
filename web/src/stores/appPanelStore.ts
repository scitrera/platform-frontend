/**
 * Application panel store.
 *
 * Manages which app is loaded in the main and secondary panels, the split
 * percentage, layout orientation, and URL-reflected query/hash/path state.
 *
 * NOTE: URL synchronisation (updateUrl) is intentionally absent from this
 * store — it is handled by a dedicated hook (useURLSync) that subscribes
 * to store changes.
 *
 * Replaces the DISPATCH_APPS slice of appStateReducer.
 */

import { create } from 'zustand';
import type { AppInfo, AppLayout } from '@/types/state';
import { DEFAULT_APPS, UI_CONSTANTS } from '@/constants/AppConstants';
import { useUIStore } from './uiStore';

interface LoadAppOptions {
  /** Override the URL query params when loading the app. */
  queryParams?: URLSearchParams | Record<string, string> | null;
  /** Override the URL hash fragment when loading the app. */
  hashParams?: string | null;
  /** Override the URL sub-path when loading the app. */
  appPath?: string | null;
  /** When true, update internal state only — do not sync the URL. */
  stateOnly?: boolean;
}

interface UpdateAppUrlOptions {
  query?: URLSearchParams | Record<string, string> | null;
  hash?: string | null;
  path?: string | null;
  /** When true, update internal state only — do not sync the URL. */
  stateOnly?: boolean;
  /** When true, the URL sync uses history.replaceState (no new history entry). */
  replace?: boolean;
}

interface AppPanelStore {
  // ── State ──────────────────────────────────────────────────────────────
  /** The primary application panel. */
  main: AppInfo | null;
  /** The secondary application panel (typically the chat app). */
  secondary: AppInfo | null;
  /** Latest status payload emitted by the active app. */
  latestAppStatus: unknown;
  /** Current URL query parameters for the active app. */
  appQueryParams: URLSearchParams | Record<string, string> | null;
  /** Current URL hash fragment for the active app. */
  appHash: string | null;
  /** Current URL sub-path for the active app. */
  appPath: string | null;
  /** Panel layout direction. */
  appLayout: AppLayout;
  /** Split percentage (0–100) between main and secondary panels. */
  appSplit: number;
  /**
   * Monotonically-increasing counter bumped whenever an action requests
   * that the next URL sync be skipped (stateOnly). Consumed by useURLSync.
   */
  urlSyncSuppressedAt: number;
  /**
   * Monotonically-increasing counter bumped whenever an action requests
   * that the next URL sync use history.replaceState instead of pushState.
   * Consumed by useURLSync to avoid polluting the back-forward stack with
   * transient overlay state (drawer open/close, etc.).
   */
  urlReplaceAt: number;

  // ── Actions ────────────────────────────────────────────────────────────
  /**
   * Load an application into the main panel.
   * Clears latestAppStatus, restores the persisted split from localStorage,
   * and optionally updates query/hash/path state.
   */
  loadApp: (app: AppInfo | null, opts?: LoadAppOptions) => void;

  /** Load an application into the secondary panel. */
  loadApp2: (app: AppInfo | null) => void;

  /** Close the main panel and reset split to 100. */
  closeMainApp: () => void;

  /** Close the secondary panel and reset split to 100. */
  closeApp2: () => void;

  /** Set the panel layout explicitly. */
  setAppLayout: (layout: AppLayout) => void;

  /** Toggle between horizontal and vertical panel layout. */
  toggleAppLayout: () => void;

  /**
   * Set the split percentage and persist it to localStorage.
   * The value is clamped between MIN_SPLIT_PCT and MAX_SPLIT_PCT.
   */
  setAppSplit: (pct: number) => void;

  /**
   * Update URL-reflected state (query, hash, path) without reloading the app.
   * Merges partial updates — omitted keys retain their current value,
   * except query which always replaces fully.
   */
  updateAppUrl: (opts: UpdateAppUrlOptions) => void;

  /** Set the latest status payload reported by the active app. */
  setLatestAppStatus: (status: unknown) => void;

  /** Internal: used by workspaceStore.setCurrentWorkspace to set panels directly. */
  _setPanels: (opts: {
    main?: AppInfo | null;
    secondary?: AppInfo | null;
    appSplit?: number;
    appPath?: string | null;
    appQueryParams?: URLSearchParams | Record<string, string> | null;
    appHash?: string | null;
  }) => void;
}

function readPersistedSplit(): number {
  const raw = localStorage.getItem(UI_CONSTANTS.LOCAL_STORAGE_APP_SPLIT_KEY);
  const parsed = raw !== null ? parseInt(raw, 10) : NaN;
  return isNaN(parsed) ? UI_CONSTANTS.DEFAULT_SPLIT_PCT : parsed;
}

export const useAppPanelStore = create<AppPanelStore>((set) => ({
  // ── Initial state ──────────────────────────────────────────────────────
  main: DEFAULT_APPS.DEFAULT_SELECT_WORKSPACE_APP as AppInfo,
  secondary: null,
  latestAppStatus: null,
  appQueryParams: null,
  appHash: null,
  appPath: null,
  appLayout: UI_CONSTANTS.APP_LAYOUT_HORIZONTAL as AppLayout,
  appSplit: UI_CONSTANTS.DEFAULT_SPLIT_PCT,
  urlSyncSuppressedAt: 0,
  urlReplaceAt: 0,

  // ── Actions ────────────────────────────────────────────────────────────
  loadApp: (app, opts = {}) => {
    set((state) => ({
      main: app,
      latestAppStatus: null,
      appQueryParams: opts.queryParams !== undefined ? opts.queryParams : state.appQueryParams,
      appHash: opts.hashParams !== undefined ? opts.hashParams : state.appHash,
      appPath: opts.appPath !== undefined ? opts.appPath : state.appPath,
      appSplit: readPersistedSplit(),
      urlSyncSuppressedAt: opts.stateOnly ? Date.now() : state.urlSyncSuppressedAt,
    }));
    useUIStore.getState().closeAllDropdowns();
  },

  loadApp2: (app) => {
    set({
      secondary: app,
      appSplit: readPersistedSplit(),
    });
    useUIStore.getState().closeAllDropdowns();
  },

  closeMainApp: () =>
    set({
      main: null,
      latestAppStatus: null,
      appSplit: 100,
    }),

  closeApp2: () =>
    set({
      secondary: null,
      appSplit: 100,
    }),

  setAppLayout: (layout) => set({ appLayout: layout }),

  toggleAppLayout: () =>
    set((state) => ({
      appLayout: state.appLayout === 'horizontal' ? 'vertical' : 'horizontal',
    })),

  setAppSplit: (pct) => {
    const clamped = Math.min(
      UI_CONSTANTS.MAX_SPLIT_PCT,
      Math.max(UI_CONSTANTS.MIN_SPLIT_PCT, pct),
    );
    localStorage.setItem(
      UI_CONSTANTS.LOCAL_STORAGE_APP_SPLIT_KEY,
      clamped.toString(),
    );
    set({ appSplit: clamped });
  },

  updateAppUrl: (opts) =>
    set((state) => ({
      appQueryParams: opts.query !== undefined ? opts.query : state.appQueryParams,
      appHash: opts.hash !== undefined ? opts.hash : state.appHash,
      appPath: opts.path !== undefined ? opts.path : state.appPath,
      urlSyncSuppressedAt: opts.stateOnly ? Date.now() : state.urlSyncSuppressedAt,
      urlReplaceAt: opts.replace ? Date.now() : state.urlReplaceAt,
    })),

  setLatestAppStatus: (status) => set({ latestAppStatus: status }),

  _setPanels: (opts) =>
    set((state) => ({
      main: opts.main !== undefined ? opts.main : state.main,
      secondary: opts.secondary !== undefined ? opts.secondary : state.secondary,
      appSplit: opts.appSplit !== undefined ? opts.appSplit : state.appSplit,
      appPath: opts.appPath !== undefined ? opts.appPath : state.appPath,
      appQueryParams: opts.appQueryParams !== undefined ? opts.appQueryParams : state.appQueryParams,
      appHash: opts.appHash !== undefined ? opts.appHash : state.appHash,
      latestAppStatus: null,
    })),
}));

/**
 * URL-parameter helpers that operate on the store state.
 * Mirrors the helpers previously exposed via useAppState().
 */
export function getAppQueryParameter(param: string): string | null {
  const qp = useAppPanelStore.getState().appQueryParams;
  if (!qp) return null;
  if (qp instanceof URLSearchParams) return qp.get(param);
  return qp[param] ?? null;
}

export function setAppQueryParameter(param: string, value: string): void {
  const current = useAppPanelStore.getState().appQueryParams;
  // Preserve URLSearchParams instance; otherwise spread the plain object.
  let next: URLSearchParams | Record<string, string>;
  if (current instanceof URLSearchParams) {
    next = new URLSearchParams(current);
    next.set(param, value);
  } else {
    next = { ...(current || {}), [param]: value };
  }
  useAppPanelStore.getState().updateAppUrl({ query: next });
}
