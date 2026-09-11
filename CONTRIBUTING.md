# Contributing

Keep client builds independent and preserve transport/auth contracts. Start with
README.md and docs/development.md. Add focused tests for behavioral changes and
use only synthetic fixtures. Do not commit sessions, credentials, customer data,
private deployment configuration, generated bundles or browser reports.

Run the checks for the component changed plus scripts/check_release.py. Existing
lint or integration gaps must remain explicit; do not remove failing checks to
claim readiness. Do not turn experimental-client feature work into a web prerequisite.

Contributions retain the license of their destination scope. Preserve upstream
copyright notices and identify adaptations in NOTICE/provenance. Discuss protocol
changes with backend/spec owners before changing wire formats.
