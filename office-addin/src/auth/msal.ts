/**
 * MSAL.js + Office Nested App Authentication (NAA) wrapper.
 *
 * Authentication priority:
 *   1. Office.auth.getAccessToken() — Office SSO / NAA (silent, no popup)
 *   2. MSAL acquireTokenSilent — cached token in MSAL's in-memory cache
 *   3. MSAL acquireTokenPopup via Office Dialog API — interactive fallback
 *
 * Token refresh: tokens are cached with their expiry; a proactive refresh
 * fires 60 s before expiry so calls are never blocked by a stale token.
 */

// MSAL is imported lazily because it has a non-trivial startup cost; most
// Office SSO flows complete on step 1 without ever loading MSAL.
import type {
  PublicClientApplication,
  AccountInfo,
  AuthenticationResult,
} from '@azure/msal-browser';

import { ENTRA_CLIENT_ID, ENTRA_AUTHORITY, DEFAULT_SCOPES, authDialogUrl } from '../lib/env';

// ---------------------------------------------------------------------------
// Cached state
// ---------------------------------------------------------------------------

interface TokenCache {
  token: string;
  expiresAt: number; // Unix ms
}

// ---------------------------------------------------------------------------
// Office Dialog message contract
// ---------------------------------------------------------------------------

/**
 * Payload the auth dialog (src/auth-dialog/main.ts) sends back to the task
 * pane via `Office.context.ui.messageParent`. Both sides serialise/parse this
 * shape as JSON. `expiresOn` is an ISO-8601 string (or omitted).
 */
export interface AuthDialogResult {
  ok: boolean;
  token?: string;
  /** ISO-8601 timestamp of token expiry, if known. */
  expiresOn?: string;
  /** MSAL account homeAccountId / username, for diagnostics. */
  account?: string;
  error?: string;
}

/**
 * Parse and validate a raw `messageParent` payload from the auth dialog.
 *
 * The Office DialogMessageReceived event delivers `arg.message` as an opaque
 * string. This helper centralises the parsing/validation so it can be unit
 * tested without a live Office runtime. Returns a normalised result; on any
 * malformed input it returns `{ ok: false, error }` rather than throwing.
 */
export function parseDialogMessage(raw: unknown): AuthDialogResult {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, error: 'Empty dialog message' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Malformed dialog message (invalid JSON)' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Malformed dialog message (not an object)' };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj['ok'] !== true) {
    const err = typeof obj['error'] === 'string' ? obj['error'] : 'Authentication failed';
    return { ok: false, error: err };
  }
  if (typeof obj['token'] !== 'string' || obj['token'].length === 0) {
    return { ok: false, error: 'Dialog reported success but returned no token' };
  }
  return {
    ok: true,
    token: obj['token'],
    expiresOn: typeof obj['expiresOn'] === 'string' ? obj['expiresOn'] : undefined,
    account: typeof obj['account'] === 'string' ? obj['account'] : undefined,
  };
}

let msalApp: PublicClientApplication | null = null;
let tokenCache: TokenCache | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** 60 s early-refresh window */
const REFRESH_AHEAD_MS = 60_000;

// ---------------------------------------------------------------------------
// MSAL initialisation (lazy)
// ---------------------------------------------------------------------------

async function getMsalApp(): Promise<PublicClientApplication> {
  if (msalApp) return msalApp;

  // Delayed import — MSAL is only loaded when Office SSO fails.
  const { PublicClientApplication } = await import('@azure/msal-browser');

  const app = new PublicClientApplication({
    auth: {
      clientId: ENTRA_CLIENT_ID,
      authority: ENTRA_AUTHORITY,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });

  await app.initialize();
  msalApp = app;
  return app;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Acquire a JWT for the given scopes.
 *
 * Returns a cached token when still valid (with the 60 s refresh window).
 * Falls through Office SSO → MSAL silent → MSAL interactive (Dialog API).
 */
export async function acquireToken(scopes: string[] = DEFAULT_SCOPES): Promise<string> {
  // 1. Return cached token if still fresh
  if (tokenCache && tokenCache.expiresAt - Date.now() > REFRESH_AHEAD_MS) {
    return tokenCache.token;
  }

  // 2. Try Office SSO / NAA (fastest — no popup, no iframe)
  try {
    const officeToken = await _tryOfficeSso();
    if (officeToken) {
      _cacheToken(officeToken);
      return officeToken;
    }
  } catch {
    // Fall through to MSAL
  }

  // 3. MSAL silent
  try {
    const msal = await getMsalApp();
    const accounts = msal.getAllAccounts();
    if (accounts.length > 0) {
      const result = await msal.acquireTokenSilent({
        scopes,
        account: accounts[0] as AccountInfo,
      });
      _cacheToken(result.accessToken, result.expiresOn ?? undefined);
      return result.accessToken;
    }
  } catch {
    // Fall through to interactive
  }

  // 4. Interactive via Office Dialog API (or popup as a last resort)
  const result = await _acquireInteractive(scopes);
  _cacheToken(result.accessToken, result.expiresOn ?? undefined);
  return result.accessToken;
}

/** Clear MSAL token cache (call on sign-out or auth failure). */
export async function clearCache(): Promise<void> {
  tokenCache = null;
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (msalApp) {
    const accounts = msalApp.getAllAccounts();
    for (const account of accounts) {
      await msalApp.clearCache({ account: account as AccountInfo });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function _tryOfficeSso(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const officeAuth = (typeof Office !== 'undefined' ? Office : null) as any;
  if (!officeAuth?.auth?.getAccessToken) return null;
  try {
    const token = await officeAuth.auth.getAccessToken({
      allowSignInPrompt: true,
      allowConsentPrompt: true,
    });
    return token as string;
  } catch {
    return null;
  }
}

async function _acquireInteractive(scopes: string[]): Promise<AuthenticationResult> {
  const msal = await getMsalApp();

  // If running inside Office, prefer the Dialog API to avoid cross-origin issues.
  // Check Office dialog API availability via cast to avoid TS2774 ("always defined").
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const officeUi = (typeof Office !== 'undefined' ? Office?.context?.ui : null) as any;
  if (officeUi?.displayDialogAsync) {
    return _acquireViaOfficeDialog(msal, scopes);
  }

  // Plain browser fallback (development/preview).
  return msal.acquireTokenPopup({ scopes });
}

async function _acquireViaOfficeDialog(
  msal: PublicClientApplication,
  scopes: string[],
): Promise<AuthenticationResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const officeUi = (typeof Office !== 'undefined' ? Office?.context?.ui : null) as any;

  // If the dialog API genuinely isn't available, fall back to popup (browser /
  // unsupported host). This is the ONLY last-resort fallback per design.
  if (!officeUi?.displayDialogAsync) {
    try {
      return await msal.acquireTokenPopup({ scopes });
    } catch (err) {
      throw new Error(
        `Interactive authentication failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Build the dialog URL from the add-in's own origin. The dialog page
  // (auth-dialog.html) runs MSAL interactive auth and messages the token back.
  // The dialog must be same-origin as the task pane (Office requirement); we
  // forward the requested scopes via the query string.
  const url = `${authDialogUrl()}?scopes=${encodeURIComponent(scopes.join(' '))}`;

  /** 2-minute hard deadline. Prevents the promise leaking if the dialog
   *  webview neither posts a message nor fires a close/error event. */
  const DIALOG_TIMEOUT_MS = 2 * 60 * 1000;

  const result = await new Promise<AuthDialogResult>((resolve, reject) => {
    officeUi.displayDialogAsync(
      url,
      { height: 60, width: 30, promptBeforeOpen: false },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (openResult: any) => {
        // Office.AsyncResultStatus.Succeeded === 'succeeded'
        if (openResult.status !== 'succeeded' || !openResult.value) {
          reject(
            new Error(
              `Failed to open auth dialog: ${openResult.error?.message ?? 'unknown error'}`,
            ),
          );
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dialog: any = openResult.value;
        let settled = false;

        const finish = (fn: () => void): void => {
          if (settled) return;
          settled = true;
          clearTimeout(guardTimer);
          try {
            dialog.close();
          } catch {
            // Dialog may already be closed; ignore.
          }
          fn();
        };

        // Guard timeout: reclaim the dialog handle if no event arrives in time.
        const guardTimer = setTimeout(() => {
          finish(() => reject(new Error('Sign-in timed out.')));
        }, DIALOG_TIMEOUT_MS);

        // Message from inside the dialog (Office.EventType.DialogMessageReceived).
        dialog.addEventHandler(
          'dialogMessageReceived',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (arg: any) => {
            const parsed = parseDialogMessage(arg?.message);
            finish(() =>
              parsed.ok
                ? resolve(parsed)
                : reject(new Error(parsed.error ?? 'Authentication failed')),
            );
          },
        );

        // Dialog closed / errored (e.g. user closed the window = code 12006).
        dialog.addEventHandler(
          'dialogEventReceived',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (arg: any) => {
            const code = arg?.error;
            const msg =
              code === 12006
                ? 'Sign-in was cancelled.'
                : `Auth dialog closed unexpectedly (code ${code ?? 'unknown'}).`;
            finish(() => reject(new Error(msg)));
          },
        );
      },
    );
  });

  if (!result.ok || !result.token) {
    throw new Error(result.error ?? 'Interactive authentication failed');
  }

  // Reshape the dialog payload into the AuthenticationResult subset the caller
  // consumes (only accessToken + expiresOn are read by acquireToken()).
  return {
    accessToken: result.token,
    expiresOn: result.expiresOn ? new Date(result.expiresOn) : null,
  } as AuthenticationResult;
}

function _cacheToken(token: string, expiresOn?: Date | null): void {
  // Default expiry: 1 hour from now if not provided (conservative fallback)
  const expiresAt = expiresOn
    ? expiresOn.getTime()
    : Date.now() + 60 * 60 * 1000;

  tokenCache = { token, expiresAt };

  // Schedule proactive refresh
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  const refreshIn = Math.max(expiresAt - Date.now() - REFRESH_AHEAD_MS, 0);
  refreshTimer = setTimeout(() => {
    // Fire-and-forget; errors are swallowed — next acquireToken() call will retry.
    void acquireToken().catch(() => undefined);
  }, refreshIn);
}
