import { useEffect, useRef } from 'react';
import { updateUrl } from '@/utils/urlUtils.js';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useAppPanelStore } from '@/stores/appPanelStore';

/**
 * Subscribes to the Zustand stores and syncs the browser URL when any of the
 * URL-reflected fields change. Replaces the impure updateUrl() calls that
 * previously lived inside appStateReducer.
 *
 * URL-updates are suppressed for a single tick when an action bumps the
 * `urlSyncSuppressedAt` counter in appPanelStore (corresponds to the legacy
 * `stateOnly: true` flag).
 *
 * Call this once at the app root (e.g., in Layout.jsx).
 */
export default function useURLSync(): void {
  const tenantId = useAuthStore((s) => s.tenantId);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const main = useAppPanelStore((s) => s.main);
  const appPath = useAppPanelStore((s) => s.appPath);
  const appQueryParams = useAppPanelStore((s) => s.appQueryParams);
  const appHash = useAppPanelStore((s) => s.appHash);
  const urlSyncSuppressedAt = useAppPanelStore((s) => s.urlSyncSuppressedAt);
  const urlReplaceAt = useAppPanelStore((s) => s.urlReplaceAt);

  // Track initial mount: the URL is the source of truth on first render,
  // so we must not push a new history entry before state has been hydrated.
  const isMounted = useRef(false);
  // Remember which suppression/replace stamps we've already consumed so that
  // only the effect run triggered by the corresponding action is affected.
  const lastConsumedSuppression = useRef(urlSyncSuppressedAt);
  const lastConsumedReplace = useRef(urlReplaceAt);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      lastConsumedSuppression.current = urlSyncSuppressedAt;
      lastConsumedReplace.current = urlReplaceAt;
      return;
    }

    if (urlSyncSuppressedAt !== lastConsumedSuppression.current) {
      lastConsumedSuppression.current = urlSyncSuppressedAt;
      return;
    }

    // Only sync when we have at least a tenant to build a meaningful URL.
    if (!tenantId) {
      return;
    }

    const replace = urlReplaceAt !== lastConsumedReplace.current;
    lastConsumedReplace.current = urlReplaceAt;

    const appId = main?.id ?? null;

    // updateUrl accepts nullable params — cast to satisfy TS strict mode
    updateUrl(
      tenantId,
      currentWorkspaceId as any,
      appId as any,
      appPath as any,
      appQueryParams as any,
      appHash as any,
      replace,
    );
  }, [tenantId, currentWorkspaceId, main, appPath, appQueryParams, appHash, urlSyncSuppressedAt, urlReplaceAt]);
}
