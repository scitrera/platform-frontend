# Development and local artifacts

Use Node 24.13.0 and Rust 1.92.0. Python 3.11+ is sufficient for repository scripts.
Web retains Vite 7 / TypeScript 6; Office retains Vite 8 / TypeScript 5.9. Both use
React 19. `private: true` prevents accidental npm publication. No root npm workspace
or SDK rewrite is required. Each component has its own lockfile and check workflow.

The Apache TypeScript spec is a reviewed subset of the public v1.3.0 archive,
revision `496e3ceb2826374a016e4e0e0a71f0a1ccb10155`. Its original runtime source and shared protocol fixtures are unmodified and
verified by file hashes. Development dependency security updates in the spec lock
are explicitly recorded in provenance.json with original and modified hashes. Both clients
reference `file:../vendor/messaging-spec/typescript`, entirely inside this repository.
Build it first. Registry npm was at 1.2.6 during preparation, so that registry
version is not substituted for required 1.3.0 execution/catalog exports.

```sh
python3 scripts/check.py spec --install
python3 scripts/check.py web --install
VITE_ENTRA_CLIENT_ID=00000000-0000-0000-0000-000000000000 ADDIN_HOST=https://localhost:3000 python3 scripts/check.py office-addin --install
python3 scripts/validate_manifests.py
python3 scripts/check.py local-agent
```

Checks continue to report independent failures, then return nonzero. Full web lint,
typecheck, tests and build pass. GitHub CI runs those checks and does not deploy,
publish or require a cloud account. Cloudflare Builds can separately build/deploy on push;
see [the web configuration](../web/README.md#cloudflare-worker).
Office uses only synthetic build IDs in CI and does not install into Office.

After reviewing edits, stage the source paths and update the public file inventory:

```sh
git add web office-addin local-agent vendor scripts docs .github README.md LICENSE LICENSES NOTICE THIRD_PARTY_NOTICES.md versions.yaml CONTRIBUTING.md SECURITY.md .gitignore .nvmrc
python3 scripts/update_manifest.py
git add source-manifest.json
python3 scripts/check_release.py
python3 scripts/artifacts.py web
python3 scripts/artifacts.py office-addin
python3 scripts/artifacts.py local-agent
```

Artifacts go to ignored `dist/`. Each component's source archive contains the full
reviewed monorepo source and build instructions. Web asset archives include the
license map and dependency notices; the web source archive is a separate local
release artifact and is never copied into served assets. Office asset archives
retain their matching `/source.tar.gz`. The web version dialog links to
https://scitrera.ai. Local-agent currently has a source artifact; its checked debug
binaries are not distributed. Artifacts have SHA-256 sidecars. No artifact command
contacts deployment services.

`npm run build:cloudflare --prefix web` prepares the app and license notices only;
it does not run the archive generator. `python3 scripts/notices.py web` can also
refresh those notices on an existing build and removes any stale `source.tar.gz`
left in `web/dist/` by the older packaging workflow.

To verify a clean source archive, unpack it into an empty temporary directory,
repeat the locked installs/builds above, then run the release checker there.
Generated files, dependency caches, private histories, source maps, captures,
storage snapshots, local TLS files and local environment overrides are excluded.
`web/.env.production` contains reviewed public defaults and is included. Browser
tests rebuild with same-origin services and telemetry disabled, overriding both
production defaults and local environment files.

Notices are collected from the actual installed npm packages, including a superset
of development dependencies; the font and icon packages keep their upstream terms.
Full platform installation/integration is deferred as described in verification.md.
Local preparation and artifact generation do not publish a release.
