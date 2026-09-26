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
`test:e2e` rebuilds with synthetic same-origin services and telemetry disabled.
Rebuild with production settings before deploying after browser tests.

For development, copy `.env.example` to `.env.local`. Production builds load the
committed public defaults in `.env.production`; override those in ignored
`.env.production.local` or the build environment. All these values are public:

| Variable | Default / meaning |
| --- | --- |
| `VITE_AUTH_ORIGIN` | HTTP(S) auth origin; empty uses a same-origin `/api/auth` proxy |
| `VITE_WS_ORIGIN` | HTTP(S) gateway origin, converted to ws(s); empty uses the same origin |
| `VITE_WS_TENANT_PATH` | `true`: `/{tenant}/rfe1-ws`; `false`: `/rfe1-ws` |
| `VITE_WS_TRANSPORT` | `websocket`; optional `socketio` |
| `VITE_SENTRY_DSN` | Empty disables telemetry; configured telemetry sends no default PII/tracing |
| `BUILD_REVISION` | Optional revision override; otherwise uses `WORKERS_CI_COMMIT_SHA` on Cloudflare, or `source` when unavailable |

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

The Cloudflare build includes license texts and dependency notices beside the app;
it does not generate or serve a source tarball. The version dialog links to
https://scitrera.ai for the project's website and source disclosures. For optional
local release archives, run `python3 scripts/artifacts.py web` from the repository
root after building. Its source archive stays separate from the served assets.
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

## Cloudflare Worker

`wrangler.toml` retains the original frontend's Worker name
(`scitrera-app-frontend-v2`), compatibility date (`2025-06-11`) and SPA fallback.
The only asset configuration addition is `directory = "./dist"`, because the
standard Vite build already produces everything Wrangler uploads. This uses
[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/),
without requiring the Cloudflare Vite plugin or changing local Vite development.

Install dependencies and build the vendored messaging spec as shown above. For an
in-place replacement, use the **same Cloudflare account** as the existing Worker.
The configuration deliberately has no account ID, route or custom-domain
assignments, matching the original configuration. Keep those deployment settings
with the existing operator setup. Another installation can override the name with
`npm run deploy -- --name <worker-name>` from `web/`.

This Worker serves assets only. It does not proxy auth or WebSockets.
Committed `.env.production` supplies the existing hosted frontend's public auth
and gateway origins and tenant path routing. It contains no credentials.
Development and unit tests do not load this production-only file.

Vite loads these settings in order of increasing priority:

1. `.env` and `.env.local` (generic values).
2. `.env.production` (committed production defaults).
3. `.env.production.local` (ignored local production overrides).
4. Environment variables supplied to the build, including Cloudflare build variables.

See [Vite environment loading](https://vite.dev/guide/env-and-mode#env-files).
Use `.env.production.local`, rather than `.env.local`, to override production
values locally. For another installation, use its service origins; for a
same-origin installation, explicitly set both origins to empty strings and
provide an auth/gateway reverse proxy. Missing origins do not fail compilation:
the browser falls back to same-origin URLs, which this static Worker cannot serve
as backend APIs. The production defaults remove that dependency on local files.

These are Vite **build-time** inputs. Worker runtime variables and `.dev.vars`
do not configure browser JS. Never put credentials in `VITE_*`: they are embedded
in the public bundle regardless of whether the input file is committed.

For the existing Cloudflare build-on-push workflow, set these
[Workers Builds settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/):

| Setting | Value |
| --- | --- |
| Root directory | `web` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy` |
| Build variable `NODE_VERSION` | `24.13.0` |

Cloudflare automatically supplies `WORKERS_CI_COMMIT_SHA` during Workers Builds.
The frontend uses it for the version dialog, displaying the first eight commit
characters. `BUILD_REVISION` remains an explicit override for other build systems.
No manually maintained revision variable is needed on Cloudflare.

Cloudflare installs web dependencies from its lockfile. `build:cloudflare` then
installs/builds the vendored messaging spec, builds the frontend, and adds license
texts and dependency notices to `dist/`. It does not generate or include source
archives. Python 3.11+ is required for release checks and notice generation. No
auth/WebSocket build variables are required for the existing hosted deployment; optionally set them under **Build variables and
secrets** to override the committed defaults. Runtime **Variables & Secrets** are
a separate setting. Existing auth CORS, allowed return URLs and cookies must
continue to match the app's origin.

For local preparation, from the repository root after installing web dependencies:

```sh
npm run build:cloudflare --prefix web
npm run deploy:dry-run --prefix web
npm run preview:worker --prefix web
```

The local Worker preview listens on `http://127.0.0.1:8787` and serves the built
assets, including deep-link fallback. It supplies no test identity or backend.
`npm run test:e2e --prefix web` builds its own same-origin synthetic configuration.
Wrangler state, `.dev.vars*` and `.env.production.local` are ignored and excluded
from source archives. `.env.production` is included; the release checker allows
its two approved public origins while continuing to scan for private material.

For a manual deployment, authenticate Wrangler with the existing account (for
example, `cd web && npx wrangler login`) or supply deployment credentials through
the environment, then run `npm run deploy --prefix web` from the repository root.
Deployment uploads the existing `dist/`; run `build:cloudflare` first after source,
configuration or browser-test changes. The GitHub check workflows do not deploy;
Cloudflare's independently configured push workflow performs publication.

### Shared and dedicated tenant entry points

The shared frontend can connect to tenant backends through `VITE_WS_ORIGIN` and
`/<tenant>/rfe1-ws`; auth-go remains at `VITE_AUTH_ORIGIN`. A deployment may provide
an optional `redirect_url` in its signed-in `/checkz` response for a user with one
tenant at a generic frontend root. The client follows a valid HTTPS hint before
opening a backend connection. An explicit shared tenant URL (`/tenant/...`)
remains on the shared frontend, and missing hints retain existing behavior. This
requires the corresponding auth-go application-URL feature and operator policy.
