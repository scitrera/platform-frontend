# Client contracts and compatibility

Source contract review targets: platform-backend 0.1.0 candidate, auth-go 0.1.3
(tag v0.1.3, revision in versions.yaml), and messaging-spec 1.3.0 at its recorded
revision. The auth-go update was reviewed on 2026-09-15. These
are compatibility inputs, not a claim that the whole deployment or every package
is publicly published. The clients consume services; backend/auth source is not
copied here. Public installation composition remains separate.

| Boundary | Required behavior |
| --- | --- |
| Auth | GET /checkz with browser credentials; successful session body provides tenants. Login `/login?rd=<encoded full return URL>` adds `tenant=<routed slug>` for branding when the application URL contains a tenant; POST `/auth/logout`. Same-origin frontend prefix mapping is documented in web/README.md. |
| Access refusal | Valid session plus no tenants or explicit `authorized:false` renders denial without re-login. Absent `authorized` remains undetermined, not automatic denial. auth-go 0.1.3 does not emit that field. |
| Native WebSocket | `/rfe1-ws/v2` behind optional tenant prefix, tenant/windowId query. CONNECTION_READY signals registration; CONNECTION_REFUSED contains diagnostic code. Upgrade success alone is insufficient. |
| Socket.IO compatibility | `/rfe1-ws`, websocket transport, tenant/windowId handshake auth. Same identity boundary and message envelopes. |
| RPC | Outbound `{id,type,payload,windowId}`; responses use event `RPC`, echo id and semantic type; failures carry type `RPX` and message. Retain event/type distinction. |
| Chat | GET_CHAT_HISTORY, CT_LIST, CHAT_STREAM spec events, task started/done, CHAT_MSG_CANCEL, CHAT_MSG_CONTROL. Stream approval decisions stay pending until authoritative resolution. |
| Browser tools | AGENT_TOOL_CATALOG publishes reviewed tool descriptors; AGENT_TOOL_CALL invokes the registered browser handler; AGENT_TOOL_RESULT carries result/error and callId. Backend binds catalog/invocation to authenticated tenant, workspace, host and execution view. |
| Files | FILE_UPLOAD_POST/FILE_UPLOAD_COMPLETE and FILE_DOWNLOAD_GET/FILE_METADATA_GET plus VFS/service-tool calls. Real storage must accept bytes and return retrievable, correctly scoped URLs; a mock URL is insufficient. |
| Embedded Admin | ADMIN_RPC_CALL `{op,args}` returns `{ok,result,error}` with per-operation backend authority checks. The UI is not an authorization enforcement boundary. |
| Office | tools-wss `/v1/connect`, delegated Entra bearer authentication, tool catalog and workspace/execution-view protocol. The pane and auth dialog must share an origin. |
| Local-agent | Real Aether transport is not implemented; do not configure it as a working execution host. MCP pieces can be tested independently. |

auth-go 0.1.3's tenant hint changes login presentation only; it does not choose an
authorized tenant or alter OAuth providers or `rd`. A tenantless application URL
omits the hint, allowing auth-go's optional default login tenant or global branding.
The `/checkz` tenant shape and POST logout contract are unchanged from 0.1.1.

Browser-session inventory/revocation introduced in auth-go 0.1.2 belongs to its
private operator dashboard/API. Redis/Valkey-backed revocation takes effect on the
next session check; existing WebSockets are not automatically terminated by it.
A revoked session returns 401 from `/checkz`, using the frontend's existing login
redirect. JWT mode has no server-side inventory/revocation. Shared session-store
configuration and live revocation verification belong to the integration project.

The retained embedded Admin covers MemoryLayer workspace/document/dataset/job/audit
views, Aether connections/audit, and billing usage/history. More privileged catalog,
chat/session/memory views keep their existing staff authority checks. These are
operations of the public main-app Admin API, not the dedicated private superadmin
application. Tenant overview/agents/connectors/MCP/users/settings and the entities
listing remain visible only under their existing privileged scaffold gates and
explicitly say they are not implemented. Section navigation IDs are not RPC names.

The old runtime-specific sandbox drawer and its `cowork.*` operations were omitted:
the candidate backend has no registrations for those operations. Supported shared
Sahara/platform protocol handling, native transport, and Socket.IO compatibility
remain. No private superadmin routes or source are needed to build this client.
The backend candidate's own private-superadmin extraction remains its owner's work.

Validation tiers are separate: browser protocol fixtures, client unit tests,
source contract review, and an actual disposable auth/backend/storage deployment.
Only the first three were available during this preparation. Live cases are
explicitly deferred to the later integration/installation repository and listed in
verification.md. No permissive proxy or fake identity was added to the application.

## Failed browser uploads

The shared uploader reports its newly minted VFS reference on every terminal
failure, including HTTP errors, network errors, cancellation, and request setup
errors. Terminal callbacks run once. The files widget removes an unfinished
reference through its existing authorized `onDelete` callback and refreshes the
listing; failure never triggers ingestion or the successful-upload callback.

If cleanup fails, the row shows `Upload failed`, remains deletable, and cannot be
used as an ingestion/chat source. The error remains in the upload tray with a
Retry action for the same workspace and folder. Retrying creates a new upload;
successful uploads in mixed batches are reported with matching file details.
Abandoned transfers from a closed page still rely on server-side stale-upload
expiry/GC; this browser callback cannot execute after the browser exits.

Unfinalized server entries remain visible at every age. After a reload, the files
widget labels them **Upload unfinished**, with a Remove action and bulk deletion.
It only shows **Uploading...** for a transfer running in that widget. Local active
transfers are excluded from selection and bulk deletion; cancel them in the upload
tray. No upload is silently discarded merely because it is old. Incomplete entries
remain unavailable for ingestion or chat references. Failed deletion reports an
error and leaves the entry actionable for retry.
