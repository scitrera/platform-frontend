/**
 * Unit tests for the Office Dialog message parsing helper and the dialog
 * guard-timeout used by the interactive auth flow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseDialogMessage } from './msal';

describe('parseDialogMessage', () => {
  it('parses a successful payload with token + metadata', () => {
    const raw = JSON.stringify({
      ok: true,
      token: 'jwt-abc',
      expiresOn: '2030-01-01T00:00:00.000Z',
      account: 'user@example.com',
    });
    const result = parseDialogMessage(raw);
    expect(result).toEqual({
      ok: true,
      token: 'jwt-abc',
      expiresOn: '2030-01-01T00:00:00.000Z',
      account: 'user@example.com',
    });
  });

  it('accepts a success payload without optional fields', () => {
    const result = parseDialogMessage(JSON.stringify({ ok: true, token: 'jwt' }));
    expect(result.ok).toBe(true);
    expect(result.token).toBe('jwt');
    expect(result.expiresOn).toBeUndefined();
    expect(result.account).toBeUndefined();
  });

  it('propagates an explicit failure with its error', () => {
    const result = parseDialogMessage(JSON.stringify({ ok: false, error: 'user denied' }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('user denied');
  });

  it('treats success-without-token as a failure', () => {
    const result = parseDialogMessage(JSON.stringify({ ok: true }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no token/i);
  });

  it('rejects malformed JSON', () => {
    const result = parseDialogMessage('not-json{');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid json/i);
  });

  it('rejects empty / non-string input', () => {
    expect(parseDialogMessage('').ok).toBe(false);
    expect(parseDialogMessage(undefined).ok).toBe(false);
    expect(parseDialogMessage(42).ok).toBe(false);
    expect(parseDialogMessage(null).ok).toBe(false);
  });

  it('rejects a JSON primitive that is not an object', () => {
    const result = parseDialogMessage(JSON.stringify('a string'));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not an object/i);
  });

  it('defaults the error message when ok=false without an error field', () => {
    const result = parseDialogMessage(JSON.stringify({ ok: false }));
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Guard-timeout test for _acquireViaOfficeDialog
// ---------------------------------------------------------------------------

/**
 * Build a minimal Office.context.ui stub that opens a dialog handle but never
 * fires any event (simulating a hung webview). Returns both the stub and a
 * handle to the fake dialog so individual tests can optionally trigger events.
 */
function makeHungDialogOffice() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeDialog: Record<string, any> = {
    handlers: {} as Record<string, (arg: unknown) => void>,
    addEventHandler(event: string, cb: (arg: unknown) => void) {
      this.handlers[event] = cb;
    },
    close: vi.fn(),
  };

  const officeUiStub = {
    displayDialogAsync(
      _url: string,
      _opts: unknown,
      cb: (result: { status: string; value: unknown }) => void,
    ) {
      // Report success immediately, handing back the fake dialog.
      cb({ status: 'succeeded', value: fakeDialog });
    },
  };

  return { fakeDialog, officeUiStub };
}

describe('_acquireViaOfficeDialog guard timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Reset the module-level msalApp / tokenCache singletons so tests are isolated.
    vi.resetModules();
  });

  it('rejects with "timed out" after 2 minutes of silence', async () => {
    const { officeUiStub } = makeHungDialogOffice();

    // Inject a fake Office global with displayDialogAsync available.
    // The Office stub in test-setup.ts has displayDialogAsync: undefined,
    // so we override just the ui property here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const officeGlobal = (globalThis as any)['Office'] as any;
    const originalUi = officeGlobal.context.ui;
    officeGlobal.context.ui = officeUiStub;

    // Also stub Office.auth.getAccessToken to throw so we reach the dialog path.
    const originalGetAccessToken = officeGlobal.auth.getAccessToken;
    officeGlobal.auth.getAccessToken = async () => { throw new Error('no SSO'); };

    // Stub getMsalApp internals: we need acquireTokenSilent to fail (no accounts)
    // and acquireTokenPopup to not be reachable. The dialog path is selected
    // because officeUi.displayDialogAsync is now truthy.
    // We don't need a real MSAL instance — _acquireInteractive checks displayDialogAsync
    // before initialising MSAL, but getMsalApp IS called first. Provide a minimal stub.
    const { PublicClientApplication } = await import('@azure/msal-browser');
    vi.spyOn(PublicClientApplication.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(PublicClientApplication.prototype, 'getAllAccounts').mockReturnValue([]);

    // Import acquireToken after stubs are in place.
    const { acquireToken } = await import('./msal');

    // Start the auth flow — it will open the fake hung dialog and wait.
    // Attach a no-op catch immediately so the rejection is always "handled"
    // from Node's perspective regardless of when the timer fires relative to
    // our assertion, preventing PromiseRejectionHandledWarning from vitest.
    const authPromise = acquireToken(['openid']);
    const guarded = authPromise.catch(() => {});

    // Advance fake timers past the 2-minute deadline.
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 1);
    await guarded;

    await expect(authPromise).rejects.toThrow(/timed out/i);

    // Restore globals.
    officeGlobal.context.ui = originalUi;
    officeGlobal.auth.getAccessToken = originalGetAccessToken;
    vi.restoreAllMocks();
  });
});
