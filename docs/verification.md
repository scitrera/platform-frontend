# Candidate verification — 2026-09-11

This is a reviewable local source candidate. **Local repository preparation checks pass.**
Web is the primary completed frontend. Full platform installation/integration is
explicitly deferred to the later integration/installation repository; no disposable
combined service profile exists yet. These results do not certify a deployed platform. No remotes, publication, Office
sideloading, identity registrations or production deployments were created.

| Component / command | Observed result |
| --- | --- |
| Spec: `npm ci`, `npm run build`, `npm test` | Pass; 98 tests |
| Web: `npm ci`, `npm run typecheck`, `npm test`, `npm run build` | Pass; 121 unit tests; production asset build |
| Web: `npm run lint` | Pass: 0 errors, 10 existing warnings. Original source had 42 errors / 13 warnings. Targeted cleanup includes regression coverage for document/tenant/workspace request isolation and sidebar state. |
| Web: `npm run test:e2e` | 8 Chromium tests passed against the built bundle with synthetic protocol fixtures |
| Office: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` | Pass; 50 tests, synthetic all-zero Entra ID and loopback manifest host |
| Office: `python3 scripts/validate_manifests.py` | Three manifests pass local XML, ID, origin and built-resource checks |
| Rust: `cargo test --workspace --locked`, `cargo build --workspace --locked` | Pass; 7 unit tests and 1 actual host/filesystem subprocess integration test; placeholder-related dead-code warnings retained |

npm audit initially reported 37 web, 47 Office and 3 spec development advisories.
Updates within the manifests' existing version ranges cleared those reports;
no app toolchain major was normalized. The spec's development lock update is
recorded separately in provenance.json; its runtime source and fixtures are
unchanged. Audit counts are registry observations, not proof of vulnerability absence.

Browser coverage: expired-session return URL (query/fragment preserved), POST
logout, valid-session denial and empty-tenant states without login loops, mobile
tenant selection, native readiness/refusal, history reload, text streaming,
approval grant/deny routing, cancel, browser tool registration/positive invocation/
unknown-tool failure, workspace navigation, reconnect without duplicate approval,
and supported embedded Admin RPC failure rendering. Default browser requests stayed
on the local origin. Synthetic desktop chat/denial/Admin error and mobile tenant
screenshots were inspected; this is not a pixel-diff regression verdict.

Native and Socket.IO provider behavior and transport error/reconnect semantics
are covered by unit tests; browser tests here exercise native transport only.
Execution-view isolation/selectors are covered by existing unit tests, not live
execution across tenants. The MCP integration exchanges actual stdio requests with
a spawned filesystem server, including read/write, glob, traversal rejection,
concurrent request ordering, error propagation and child termination. Permission
policy unit tests remain separate from the unwired daemon transport.

## Deferred platform integration

The release preparation decision is to finish the individual AGPL repositories
first, then establish a disposable integration/installation profile. This is
follow-up work for that repository, not unfinished frontend extraction:

1. Compose actual auth-go → authenticated gateway → platform backend →
   Sahara/tools/catalog → data/storage services with synthetic identities.
2. Verify identity/tenant/workspace isolation, both supported transports, chat
   progress/cancel/reload, authority-bound browser tools and execution views,
   approval outcomes, unavailable hosts, genuine upload/download bytes and
   retrievable artifacts/citations, and representative tenant Admin operations.
3. Coordinate backend packaging and service configuration with their owners.
   This frontend contains no dedicated superadmin and copies no backend source.

Client unit tests, synthetic browser routing and source contract review establish
component behavior; they do not substitute for the deferred combined acceptance.

Office-host authentication/Word/Excel/PowerPoint editing and actual daemon cloud
transport remain **unverified/incomplete experimental capabilities**. Completing
those roadmaps is not a web release prerequisite. The local filesystem checks are
not a race-free OS sandbox; arbitrary MCP interoperability is not certified.

All component installs/checks and the eight browser scenarios were repeated from
a fresh source archive in a temporary directory without the original monorepo.
Source hashes, license scope, public dependency provenance and generated asset
exclusions are checked by `scripts/check_release.py`. Packaging commands create
local source/asset archives and dependency notices; they do not publish. Reproduce
the clean-source checks and artifact checks in docs/development.md. Private input
snapshots, full logs, screenshots and detailed review evidence stay outside this
candidate.
