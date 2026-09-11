# Scitrera Platform Frontend

The client applications for the Scitrera platform. **`web/` is the primary,
completed user-facing application.** This repository is a local source candidate;
release verification is recorded in [docs/verification.md](docs/verification.md).

| Component | Status | Build |
| --- | --- | --- |
| [web](web/README.md) | Primary application: chat, workspaces, files, knowledgebase, embedded tenant administration | Node 24.13.0, independent npm lock |
| [office-addin](office-addin/README.md) | Experimental/incomplete; Office host/auth integration unverified | Node 24.13.0, independent npm lock |
| [local-agent](local-agent/README.md) | Experimental/incomplete; Aether transport is a placeholder | Rust 1.92.0, three-crate Cargo workspace |

Start with web:

```sh
npm ci --prefix vendor/messaging-spec/typescript
npm run build --prefix vendor/messaging-spec/typescript
npm ci --prefix web
cp web/.env.example web/.env.local
npm run dev --prefix web
```

Configure an auth-go instance and an authenticated platform gateway as described in
[web/README.md](web/README.md). The unconfigured frontend never contacts a hosted
Scitrera auth/backend. It needs real platform services to sign in or chat.

[Development](docs/development.md), [client contracts](docs/client-contracts.md),
[verification](docs/verification.md), and [license map](THIRD_PARTY_NOTICES.md).
Builds are separate; experimental-client completion is not a prerequisite for web.
The private superadmin application, authentication dashboard, and backend source
are separate projects and are not included here. Embedded Admin uses the public
platform WebSocket API and preserves its server-enforced authority distinctions.

First-party web/Office/root code: **AGPL-3.0-only**. Local-agent: **MIT**.
Messaging spec and Chainlit cursor: **Apache-2.0**. shadcn/ui primitives: **MIT**.
See LICENSE, NOTICE and THIRD_PARTY_NOTICES.md for exact scope.

No deployment or publication workflow is enabled. Component versions and tag
prefixes in versions.yaml describe candidate artifacts, not published releases.
