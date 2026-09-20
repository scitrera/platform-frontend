# Platform web application

The primary platform client, preserving the existing React application and design.
It supports native WebSocket by default and selectable Socket.IO compatibility.
Authentication uses auth-go (reviewed through 0.1.3); opening a socket does not
grant application access.

Requires Node **24.13.0** (see ../.nvmrc). From the repository root:

```sh
npm ci --prefix vendor/messaging-spec/typescript
npm run build --prefix vendor/messaging-spec/typescript
npm ci --prefix web
npm run typecheck --prefix web
npm test --prefix web
npm run lint --prefix web
npm run build --prefix web
npm run test:e2e --prefix web
```

The full lint command retains existing warnings; see ../docs/verification.md.
Vite compilation and the separate TypeScript check are reported independently.
Browser tests use Chromium (`cd web && npx playwright install chromium`).

Copy `.env.example` to `.env.local` and set public configuration before building:

| Variable | Default / meaning |
| --- | --- |
| `VITE_AUTH_ORIGIN` | Empty: same-origin `/api/auth` proxy; otherwise an HTTP(S) origin |
| `VITE_WS_ORIGIN` | Empty: same-origin gateway; otherwise an HTTP(S) origin, converted to ws(s) |
| `VITE_WS_TENANT_PATH` | `true`: `/{tenant}/rfe1-ws`; `false`: `/rfe1-ws` |
| `VITE_WS_TRANSPORT` | `websocket`; optional `socketio` |
| `VITE_SENTRY_DSN` | Empty disables telemetry; configured telemetry sends no default PII/tracing |
| `BUILD_REVISION` | Build process variable for the version dialog; default `source` |

`localStorage.ws_transport` is an optional browser override unless the build sets
`VITE_WS_TRANSPORT`. Both paths require the same authenticated gateway. Native
WebSocket appends `/v2` and sends tenant/window IDs as query parameters; these are
routing data, not credentials. Socket.IO retains `transports: ['websocket']`.

For development, optional `DEV_AUTH_TARGET` and `DEV_GATEWAY_TARGET` proxy to an
operator's auth-go and authenticated gateway. They preserve cookies and Origin,
verify upstream TLS, and inject no identity headers. `DEV_TLS_CERT`/`DEV_TLS_KEY`
explicitly select local certificates. Configure auth-go cookie domains, allowed
origins/return URLs and gateway origins to match the browser origin including its
port. No certificate or cookie is supplied. Never connect a public dev proxy to an
unprotected backend that trusts user-controlled identity headers.

Login redirects from `/{tenant}/...` include `tenant=<slug>` for auth-go 0.1.3's
login branding while preserving the full `rd` return URL. The hint is presentation
only; auth-go checks tenant validity and falls back to global branding if needed.
At `/`, the hint is omitted so auth-go can use `SCITRERA_AUTH_LOGIN_DEFAULT_TENANT`
when configured. Set tenant names/logos in auth-go's Tenant profile; global
`SCITRERA_AUTH_BRAND_*` settings also belong to auth-go, not the frontend build.
Browser-session management remains in auth-go's operator dashboard. See
[client contracts](../docs/client-contracts.md) for revocation behavior.

Serve `dist/` at the root of an origin. Reserve `/api/auth/*` for auth-go's external
plane and strip that prefix: `/api/auth/checkz` -> `/checkz`,
`/api/auth/login` -> `/login`, `/api/auth/auth/logout` -> `/auth/logout` (POST).
Forward `/{tenant}/rfe1-ws` and its `/v2` child to the authenticated gateway,
including WebSocket upgrades. The gateway owns tenant selection/routing before
forwarding the unscoped service path to platform-server. Use an SPA fallback to
`index.html` for tenant/workspace/app deep links; never rewrite auth, assets,
source archives or gateway responses to HTML. Subdirectory asset hosting is not
supported by this candidate. With explicit cross-origin auth, configure credentialed
CORS and appropriate cookie policy on the services; do not use wildcard origins.

`npm run preview` serves assets for local inspection only. It does not provide
identity, reverse proxying or backend services. Full installation orchestration is
owned by the separate integration project. Build-time VITE values are public and
embedded into JS. Never put tokens, private keys, or privileged headers there.

Use `python3 scripts/artifacts.py web` from the repository root after building to
create an asset archive, matching source archive and dependency notices. The
version dialog links to https://scitrera.ai. Serve the packaged source archive and
notices beside the app.
Tenant appearance is configured through the authenticated profile's `uiConfig`
(operator API: `TenantInterface2.set_ui_config_variables`). No image rebuild is
needed to change these values; reload the client to fetch an updated profile.

| UI setting | Default | Behavior |
| --- | --- | --- |
| `forcedTheme` | `null` | `"light"` or `"dark"` fixes the theme and hides the theme toggle. `null` (or an unrecognized value) restores the saved browser/system preference. |
| `showThemeToggle` | `true` | `false` hides the header toggle without changing the selected theme. Use `forcedTheme` when the theme must also be fixed. |

A fixed tenant theme overrides saved preferences and OS theme changes, and
ignores programmatic theme switches. It preserves the browser's saved preference
for use when the policy is removed or a different tenant is selected.

Dynamic JSX executes trusted application code in the browser and is not an
untrusted-code sandbox; backend catalog and authorization policy must control it.

Expanded source review accepts optional `regions` on each source reference.
Each contains `region_id`, `image_sha256`, `bbox: [x0,y0,x1,y1]` in normalized
page coordinates, and `origin: "ocr" | "review_crop"`. The page loader returns
`image_sha256` alongside `image_url`. Overlays appear only for the selected
reference and a matching image hash; missing or invalid geometry keeps the
ordinary page preview. Relative coordinates follow image resizing and zoom.
The producer must validate passage/region provenance before publishing evidence.

Over a source page image, Ctrl+wheel zooms between fit width and 400%, keeping
its point under the cursor stable. Above fit width, primary mouse drag pans the
preview (including when the pointer leaves the image). The zoom selector still
works; ordinary scrolling and transcript text selection keep their usual behavior.
The comment margin occupies space only while it contains saved comments or an
open comment editor. The Add comment toolbar action remains available when empty.
