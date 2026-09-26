# AnnotatedMarkdown source review

By default, the component retains its inline margin-comment behavior. Hosts may
opt into `expandedOnly` to show a compact reading toolbar and move comments into
an expanded review. `toolbarActions` supplies the compact host action;
`expandedTabs` and `title` supply the expanded header. Open editor text survives
closing; compact actions are disabled until that editor is saved or cancelled.

Supply `loadEvidence()` and `loadSourcePage(documentId, oneBasedPage)` for the
split source viewer. The manifest must map every top-level rendered bullet, in
order, to its reviewed point and must match `documentVersion` exactly. The host
owns persistence and all authorization, revision and source-set checks. Loaders
must return fresh user-authorized file URLs; do not put binary images in RPCs.

The viewer mounts only nearby page images, supports page/document navigation,
zoom, keyboard evidence selection, a resizable divider and mobile pane switching.
References may carry multiple intermediate `via` analysis passages. Transcript
highlighting is an exact whitespace-normalized unique match; prose locators do
not imply pixel coordinates. Missing/stale evidence is displayed explicitly.

Source image paths resolve against the authenticated tenant profile's
`uiConfig.storageOrigin`, falling back to the frontend origin for older or
same-origin deployments. Cross-origin reads include session cookies and send
capabilities only in `X-Blob-Capability`; the storage host must allow the exact
frontend origin with credentialed GET/HEAD CORS and that header. Arbitrary image
origins, redirects and HTTPS-to-HTTP downgrades are rejected. Cache state is
cleared when the tenant or configured storage origin changes. No customer
hostname is compiled into the shared frontend.
