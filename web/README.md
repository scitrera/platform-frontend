# Platform web application

The primary platform client, preserving the existing React application and design.
It supports native WebSocket by default and selectable Socket.IO compatibility.
Authentication uses auth-go; opening a socket does not grant application access.

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

The full lint command currently reports pre-existing errors; see verification.md.
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
version dialog links `/source.tar.gz`; serve the packaged archive beside the app.
Dynamic JSX executes trusted application code in the browser and is not an
untrusted-code sandbox; backend catalog and authorization policy must control it.
