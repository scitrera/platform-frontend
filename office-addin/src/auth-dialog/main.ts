/**
 * Auth dialog entry point.
 *
 * This module runs INSIDE an Office Dialog window opened by the task pane
 * (see `_acquireViaOfficeDialog` in ../auth/msal.ts). The dialog is same-origin
 * with the task pane (Office requirement), which is why the dialog URL is built
 * from the add-in's own origin.
 *
 * Flow:
 *   1. On first load, call handleRedirectPromise() to pick up a returning
 *      redirect (no-op on the very first entry).
 *   2. If no cached account / no redirect result, kick off an interactive
 *      acquireTokenRedirect — the dialog window navigates to Entra and comes
 *      back to this same page.
 *   3. On success, messageParent({ ok:true, token, account, expiresOn }).
 *      On failure, messageParent({ ok:false, error }).
 *
 * acquireTokenRedirect is used (not popup) because popups inside an Office
 * Dialog are themselves blocked in many desktop webviews — the whole point of
 * routing through the dialog is to get a navigable window we control.
 */
import type { AccountInfo, AuthenticationResult } from '@azure/msal-browser';
import { ENTRA_CLIENT_ID, ENTRA_AUTHORITY, DEFAULT_SCOPES } from '../lib/env';
import type { AuthDialogResult } from '../auth/msal';

/** Read requested scopes from the query string, falling back to defaults. */
function requestedScopes(): string[] {
  const raw = new URLSearchParams(window.location.search).get('scopes');
  if (!raw) return DEFAULT_SCOPES;
  const scopes = raw.split(' ').map((s) => s.trim()).filter(Boolean);
  return scopes.length > 0 ? scopes : DEFAULT_SCOPES;
}

/** Send the result back to the task pane and (best-effort) update the UI. */
function messageParent(result: AuthDialogResult): void {
  const payload = JSON.stringify(result);
  const officeUi = Office?.context?.ui;
  if (officeUi?.messageParent) {
    officeUi.messageParent(payload);
  }
  const el = document.getElementById('status');
  if (el) el.textContent = result.ok ? 'Signed in. You can close this window.' : `Sign-in failed: ${result.error ?? 'unknown error'}`;
}

function toDialogResult(result: AuthenticationResult): AuthDialogResult {
  return {
    ok: true,
    token: result.accessToken,
    expiresOn: result.expiresOn ? result.expiresOn.toISOString() : undefined,
    account: result.account?.homeAccountId ?? result.account?.username,
  };
}

async function run(): Promise<void> {
  const scopes = requestedScopes();
  // MSAL is imported here (not at module top) to mirror the lazy-load pattern
  // in ../auth/msal.ts and keep the redirect round-trip lean.
  const { PublicClientApplication } = await import('@azure/msal-browser');

  const app = new PublicClientApplication({
    auth: {
      clientId: ENTRA_CLIENT_ID,
      authority: ENTRA_AUTHORITY,
      // The dialog page itself is the redirect URI. This URL must be registered
      // as a SPA redirect URI in the Entra app registration.
      redirectUri: `${window.location.origin}/auth-dialog.html`,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });
  await app.initialize();

  // 1. Pick up a returning redirect, if any.
  const redirectResult = await app.handleRedirectPromise();
  if (redirectResult) {
    messageParent(toDialogResult(redirectResult));
    return;
  }

  // 2. Try silent against any cached account before forcing interaction.
  const accounts = app.getAllAccounts();
  if (accounts.length > 0) {
    try {
      const silent = await app.acquireTokenSilent({
        scopes,
        account: accounts[0] as AccountInfo,
      });
      messageParent(toDialogResult(silent));
      return;
    } catch {
      // Fall through to interactive redirect.
    }
  }

  // 3. Interactive redirect — navigates away and returns to this page.
  await app.acquireTokenRedirect({ scopes });
}

Office.onReady(() => {
  run().catch((err: unknown) => {
    messageParent({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  });
});
