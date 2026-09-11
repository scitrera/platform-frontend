# Client contracts and compatibility

Source contract review targets: platform-backend 0.1.0 candidate, auth-go 0.1.1
candidate, and messaging-spec 1.3.0 at the exact revision in versions.yaml. These
are compatibility inputs, not a claim that the whole deployment or every package
is publicly published. The clients consume services; backend/auth source is not
copied here. Public installation composition remains separate.

| Boundary | Required behavior |
| --- | --- |
| Auth | GET /checkz with browser credentials; successful session body provides tenants. Login `/login?rd=<encoded full return URL>`; POST `/auth/logout`. Same-origin frontend prefix mapping is documented in web/README.md. |
| Access refusal | Valid session plus no tenants or explicit `authorized:false` renders denial without re-login. Absent `authorized` remains undetermined, not automatic denial. The current auth service does not guarantee that field. |
| Native WebSocket | `/rfe1-ws/v2` behind optional tenant prefix, tenant/windowId query. CONNECTION_READY signals registration; CONNECTION_REFUSED contains diagnostic code. Upgrade success alone is insufficient. |
| Socket.IO compatibility | `/rfe1-ws`, websocket transport, tenant/windowId handshake auth. Same identity boundary and message envelopes. |
| RPC | Outbound `{id,type,payload,windowId}`; responses use event `RPC`, echo id and semantic type; failures carry type `RPX` and message. Retain event/type distinction. |
| Chat | GET_CHAT_HISTORY, CT_LIST, CHAT_STREAM spec events, task started/done, CHAT_MSG_CANCEL, CHAT_MSG_CONTROL. Stream approval decisions stay pending until authoritative resolution. |
| Browser tools | AGENT_TOOL_CATALOG publishes reviewed tool descriptors; AGENT_TOOL_CALL invokes the registered browser handler; AGENT_TOOL_RESULT carries result/error and callId. Backend binds catalog/invocation to authenticated tenant, workspace, host and execution view. |
| Files | FILE_UPLOAD_POST/FILE_UPLOAD_COMPLETE and FILE_DOWNLOAD_GET/FILE_METADATA_GET plus VFS/service-tool calls. Real storage must accept bytes and return retrievable, correctly scoped URLs; a mock URL is insufficient. |
| Embedded Admin | ADMIN_RPC_CALL `{op,args}` returns `{ok,result,error}` with per-operation backend authority checks. The UI is not an authorization enforcement boundary. |
| Office | tools-wss `/v1/connect`, delegated Entra bearer authentication, tool catalog and workspace/execution-view protocol. The pane and auth dialog must share an origin. |
| Local-agent | Real Aether transport is not implemented; do not configure it as a working execution host. MCP pieces can be tested independently. |

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
