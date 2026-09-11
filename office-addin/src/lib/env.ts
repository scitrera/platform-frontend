/// <reference types="vite/client" />
/**
 * Build-time environment variables for the Office add-in.
 *
 * Copy `.env.example` to `.env.local` and fill in real values before running
 * or building. All VITE_* vars are inlined at build time by Vite.
 *
 *   VITE_TOOLS_WSS_URL=wss://localhost:8443/v1/connect
 *   VITE_ENTRA_CLIENT_ID=<your-app-registration-client-id>
 *   VITE_ENTRA_AUTHORITY=https://login.microsoftonline.com/<tenant-id>/v2.0
 */

export const TOOLS_WSS_URL: string =
  import.meta.env['VITE_TOOLS_WSS_URL'] ?? 'wss://localhost:8443/v1/connect';

const _clientId: string = import.meta.env['VITE_ENTRA_CLIENT_ID'] ?? '';
if (!_clientId) {
  throw new Error(
    'VITE_ENTRA_CLIENT_ID is not set. ' +
    'Copy .env.example to .env.local and provide your Azure app-registration client ID. ' +
    'Without it the api://<client-id>/access_as_user scope cannot be constructed and auth will fail.',
  );
}
export const ENTRA_CLIENT_ID: string = _clientId;

export const ENTRA_AUTHORITY: string =
  import.meta.env['VITE_ENTRA_AUTHORITY'] ??
  'https://login.microsoftonline.com/common/v2.0';

/** Default OAuth scopes to request. Extend as needed. */
export const DEFAULT_SCOPES: string[] = [
  'openid',
  'profile',
  'offline_access',
  `api://${ENTRA_CLIENT_ID}/access_as_user`,
];

/**
 * Absolute URL of the interactive auth dialog page that runs MSAL redirect
 * inside an Office Dialog.
 *
 * Built from the add-in's own origin so it always matches whichever host the
 * bundle was deployed under (dev 127.0.0.1:3000, localhost:3000, or
 * the A3 build-time ADDIN_HOST). Office's displayDialogAsync requires the
 * dialog to be same-origin as the task pane, so this MUST resolve to the same
 * origin the task pane is served from.
 */
export function authDialogUrl(): string {
  const origin =
    typeof window !== 'undefined' && window.location
      ? window.location.origin
      : '';
  return `${origin}/auth-dialog.html`;
}
