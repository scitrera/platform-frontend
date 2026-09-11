# License map

| Scope | License / provenance |
| --- | --- |
| First-party `web/`, `office-addin/`, root scripts/docs | AGPL-3.0-only, root LICENSE |
| `local-agent/` and its three crates | MIT, local-agent/LICENSE; preserved workspace metadata |
| `vendor/messaging-spec/` | Apache-2.0; upstream revision and file hashes in provenance.json |
| `web/src/components/Widgets/BlinkingCursor.jsx` | Chainlit Apache-2.0 adaptation; LICENSES/Chainlit-Apache-2.0.txt |
| `web/src/components/ui/` | shadcn/ui-derived MIT primitives; LICENSES/shadcn-ui-MIT.txt |
| Scitrera PNG/ICO branding; Office solid-color placeholder icons | First-party assets; AGPL-3.0-only copyright scope, trademarks reserved |
| Geist font | SIL Open Font License, supplied by @fontsource-variable/geist |
| KaTeX fonts / code, React, Radix, Lucide, Streamdown and other npm dependencies | Their installed package licenses, collected by scripts/notices.py |
| Office.js loaded from Microsoft CDN | External host runtime, governed by Microsoft's terms; not a first-party bundle license |
| Cargo dependencies | Their package licenses; `cargo metadata --locked` records exact packages |

Source imports do not relicense dependencies. `scripts/notices.py` collects license
texts and package name/version/license metadata from all installed npm packages
(including development dependencies, a conservative superset of bundled code).
Generated notices accompany each JavaScript distribution. npm and Cargo locks pin
package versions/integrity. Keep upstream notices when redistributing modified code.

The local-agent MIT scope preserves the pre-existing declaration; it does not
assert a separate historical authorship audit. Public dependency source is
independently obtainable; the full original application history is not included.

`LICENSES/dependencies/provenance.json` records supplemental notices from pinned
upstream revisions or the exact npm package README. The copied V8 notice in
stackback is retained separately. Packages that declare MIT/Apache but supply no
standalone notice are identified as such in generated metadata: standard license
terms and original author/contributor metadata are included without inventing a
copyright statement. The standard MIT text has its own pinned SPDX provenance.
Platform-specific build bindings inherit the installed parent package's exact
version notice. Packaging fails if no reviewed terms can be resolved.
