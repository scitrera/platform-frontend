# Office add-in — experimental / incomplete

This source contains a task pane, command entrypoint, same-origin authentication
dialog, tools-wss client and Word/Excel/PowerPoint tool implementations. Successful
builds and mocked tests do **not** establish working Office-host authentication or
document editing. No real Office host/account was exercised during preparation.

Node 24.13.0; from the repository root, build the pinned spec first:

```sh
npm ci --prefix vendor/messaging-spec/typescript
npm run build --prefix vendor/messaging-spec/typescript
npm ci --prefix office-addin
npm run lint --prefix office-addin
npm run typecheck --prefix office-addin
npm test --prefix office-addin
VITE_ENTRA_CLIENT_ID=00000000-0000-0000-0000-000000000000 ADDIN_HOST=https://localhost:3000 npm run build --prefix office-addin
```

The all-zero ID is only a synthetic build value and cannot sign in. Supply your own
public Entra app ID and authority in `.env.local`, and set `VITE_TOOLS_WSS_URL` to
your authenticated tools-wss service. There is no production service default.
The client requests `api://<client-id>/access_as_user` plus OIDC scopes. Configure
that delegated scope and same-origin `/auth-dialog.html` redirect URI in your
registration. No client secret belongs in this app. This repository does not create
registrations, deploy assets, upload manifests or sideload an add-in.

`ADDIN_HOST` (or `VITE_ADDIN_HOST`) must be exported into the build process for
manifest generation; the Node script does not load `.env.local`. Default:
`https://localhost:3000`. All three manifests retain separate synthetic IDs;
operators must choose their own persistent IDs before host installation. Templates
include the pane origin and Microsoft identity domain, no private service domains.
Add any operator-required AppDomains after validating the target host's requirements.

```sh
ADDIN_HOST=https://addin.example.test npm run build:manifests --prefix office-addin
DEV_TLS_CERT=/path/to/local.crt DEV_TLS_KEY=/path/to/local.key npm run dev --prefix office-addin
```

Serve the pane, `/auth-dialog.html`, `/src/commands/commands.html`, icons and manifest
outputs together. Office requires an appropriately trusted HTTPS origin; local HTTP
fallback is only for browser inspection. TLS files are explicit developer inputs,
not read implicitly from a home directory. Source maps are disabled in public builds.
`python3 scripts/artifacts.py office-addin` packages assets, source and notices.

Tests cover dialog-message validation, WebSocket authentication/reconnect and
catalog requests, chat state, workspace/view selection and manifest substitution.
Word/Excel/PowerPoint host APIs, delegated consent, dialog messaging inside Office,
and actual platform-to-document tool invocation remain unverified. UI scaffolding,
placeholder icons and incomplete host-specific flows retain experimental status.
AGPL-3.0-only except dependency licenses documented at the repository root.

Manifest AppDomain entries include scheme and port, as required by [Microsoft’s AppDomain documentation](https://learn.microsoft.com/en-us/javascript/api/manifest/appdomain). Local XML/resource checks are not Office-host or store certification.
