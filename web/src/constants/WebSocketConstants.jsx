/**
 * WebSocketConstants.jsx
 *
 * This file contains all the string constants used for WebSocket message types
 * throughout the application. Centralizing these constants makes it easier to
 * maintain consistency and avoid typos when working with WebSocket messages.
 */


// Dynamic JSX-related message types
export const DYNAMIC_JSX = {
    // JSX CONTENT / APP REQUEST OR RESPONSE
    CONTENT: 'DYNAMIC_JSX_CONTENT',

    // JSX DYNAMIC UPDATE REQUEST OR RESPONSE
    UPDATE: 'JSX_UPDATE'
};

export const CUSTOM_COMPONENTS = {
    SIDEBAR: '_sidebar',
    PLACEHOLDER: '_placeholder',
}

// Chat-related message types
export const CHAT = {
    // CHAT HISTORY REQUEST OR RESPONSE
    HISTORY: 'GET_CHAT_HISTORY',

    // CHAT HISTORY CLEAR REQUEST OR RESPONSE
    CLEAR: 'CHAT_CLEAR',

    // ADD MESSAGE NOTIFICATION
    APPEND_MESSAGE: 'CHAT_MESSAGE',

    APPEND_TOKENS: 'CHAT_TOKENS',

    // APPEND a structured dynamic content block (image / file / custom)
    // onto the assistant's working chat message during a live turn.
    // Distinct from USER.TOOL_CALL (which is an RPC for dynamic-JSX tool
    // calls) and from DYNAMIC_JSX.* (which targets the Apps dashboard).
    // Payload: {threadId: string, block: {kind, mime, filename, data_base64 | doc_id, ...}}.
    APPEND_DYNAMIC: 'CHAT_APPEND_DYNAMIC',

    // APPEND structured citations [{number, title, url, source, snippet}]
    // onto the assistant's working chat message. Surfaced by the
    // CitationList footer in MessageItem. Tools that produce sources
    // (deep_research today; future sandbox-side helpers) emit a
    // ``__COWORK_CITATIONS__`` suffix-tag the agent runtime turns into
    // this event. Payload: {threadId: string, citations: [...]}.
    APPEND_CITATIONS: 'CHAT_APPEND_CITATIONS',

    FILE_UPLOAD_POST: 'FILE_UPLOAD_POST',
    FILE_METADATA_GET: 'FILE_METADATA_GET',
    FILE_DOWNLOAD_GET: 'FILE_DOWNLOAD_GET',
    // Emitted after the blob upload to S3 completes to trigger user-initiated
    // document ingestion. Payload contract:
    //   { workspace, visibility?, items: [{ vfs_ref|blob_key|doc_id,
    //     content_hash?, source_path?, content_type?, size_bytes? }] }
    // Phase 4 (upload panel) wires the frontend to send this.
    FILE_UPLOAD_COMPLETE: 'FILE_UPLOAD_COMPLETE',

    CHAT_PROGRESS: 'CHAT_PROGRESS',

    // Live tool-call / tool-result block — same shape as history's
    // tool_calls entries plus a `status` field. The UI uses this to
    // render the in-progress tool inline (with a spinner where the
    // result will land) instead of the legacy "humanized progress"
    // string-only path. Status values: running | completed | cancelled | failed.
    APPEND_TOOL_BLOCK: 'CHAT_APPEND_TOOL_BLOCK',

    // Universal messaging-spec stream events from the sidecar
    // (message_started / part_appended / token_delta / part_updated /
    // message_finalized). Payload: {threadId, event}. The spec-aware
    // client reducer (`apply_event`) replays the event sequence into a
    // canonical ChatMessage. See scitrera-ecosystem-messaging-spec.
    STREAM: 'CHAT_STREAM',

    // CHAT MESSAGE LIFECYCLE TASKS — each user→agent message is wrapped in
    // an Aether ``chat_message`` task so the UI can show send-vs-cancel
    // accurately across tabs and the user can cancel an in-flight message.
    // See backend ws_constants.py for the full event-shape contract.
    MESSAGE_TASK_STARTED: 'CHAT_MSG_TASK_STARTED',  // {threadId, taskId, messageId, startedAt}
    MESSAGE_TASK_DONE: 'CHAT_MSG_TASK_DONE',        // {threadId, taskId, status}
    CANCEL_MESSAGE: 'CHAT_MSG_CANCEL',              // {taskId} → triggers TaskOperation.CANCEL
    // Generic in-band control decision addressed to an in-flight task. The
    // frontend builds a spec ChatMessage carrying a ControlPart (e.g. the
    // user's approve/deny answer to an approval_request) and the backend
    // forwards it to the agent. Payload: {workspace, threadId, taskId, message}.
    CONTROL: 'CHAT_MSG_CONTROL',
    GET_ACTIVE_TASKS: 'CHAT_GET_ACTIVE_TASKS',      // {workspace} → reconnect/seed map

    FEEDBACK: 'CHAT_FEEDBACK',
    EDIT_MESSAGE: 'CHAT_EDIT',

    THREAD_ADD: 'CT_ADD',
    THREAD_RENAME: 'CT_RENAME',
    THREAD_AUTO_RENAMED: 'CT_AUTO_RENAMED',  // backend-initiated title update (LLM-generated)
    THREAD_DELETE: 'CT_DELETE',
    THREAD_LIST: 'CT_LIST',
    THREAD_SEARCH: 'CT_SEARCH',
};

// User related message types
export const USER = {
    GET_PROFILE: 'GET_USER_PROFILE',
    SWITCH_TENANT: 'SWITCH_TENANT',
    // SELECTED_WORKSPACE: 'USER_SELECTED_WORKSPACE'
    TOOL_CALL: 'TOOL_CALL',
    APP_PROGRESS: 'APP_PROGRESS',
};

// Agent-initiated message types — the inverse of USER.TOOL_CALL (which is
// frontend→backend RPC). AGENT.TOOL_CALL is backend/agent→frontend: the
// supervisor agent asks the UI to invoke a registered frontend tool
// (switch_workspace, select_app, set_chat_state, etc.).
//
// Payload: {toolName: string, args?: Record<string, unknown>, callId?: string}
// If callId is provided, the frontend replies with AGENT.TOOL_RESULT:
// Payload: {callId: string, result?: unknown, error?: string}
// Without callId the invocation is fire-and-forget (no ack expected).
export const AGENT = {
    TOOL_CALL: 'AGENT_TOOL_CALL',
    TOOL_RESULT: 'AGENT_TOOL_RESULT',
    TOOL_CATALOG: 'AGENT_TOOL_CATALOG',
};

export const WORKSPACE = {
    GET_WORKSPACES: 'GET_WORKSPACES',
    GET_APPLICATIONS: 'GET_APPS',
    GET_BACKGROUND_TASKS: 'GET_BACKGROUND_TASKS',
    TOAST: 'TOAST',

    CREATE_WORKSPACE: 'WS_CREATE',

    LIST_MEMBERS: 'WS_LIST_SHARE',
    SHARE: 'WS_SHARE',
    UNSHARE: 'WS_UNSHARE',
    DELETE: 'WS_DELETE',
    RENAME: 'WS_RENAME',

    DP_ADD: 'DP_ADD',
    DP_EDIT: 'DP_EDIT',
    DP_DELETE: 'DP_DELETE',
    DP_TEST: 'DP_TEST',
    DP_PATH: 'DP_PATH',
    MF_SEARCH: 'MF_SEARCH',

    TN_LIST_USERS: 'TN_LIST_USERS',
}

// Connection management message types
export const CONNECTION = {
    PING: 'PING', RPC_MESSAGE: 'RPC', RPC_EXCEPTION: 'RPX'
}

// Why the SERVER refused a connection, read from err.data.code on 'connect_error'.
//
// These arrive in a Socket.IO CONNECT_ERROR packet, sent over the transport
// AFTER it is established — which is precisely what makes them readable. A
// rejection one layer earlier (the gateway's ext_authz 403 on the WebSocket
// upgrade) is NOT: browsers never expose a failed upgrade's HTTP status to JS,
// so that case can only ever be reported vaguely. When one of these codes is
// present the outcome is definitive and reconnecting cannot change it.
//
// Keep in sync with REFUSED_* in
// backend/scitrera_app_server/websocket/ws_constants.py.
export const CONNECTION_REFUSED = {
    NO_TENANTS: 'no_tenants',                    // account belongs to no organization
    TENANT_NOT_PERMITTED: 'tenant_not_permitted', // not a member of THIS organization
    INTERNAL: 'internal',                        // server-side fault; cause stays server-side
}

// Admin Dashboard RPC
export const ADMIN_RPC = {
    CALL: 'ADMIN_RPC_CALL',
};

// Server-pushed admin events. The admin console is otherwise poll-only; this
// is the first push into it. Backend emits SANDBOX_UPGRADE_PROGRESS as a
// Socket.IO event (NOT an RPC response) with payload
// {sandbox_id, phase, message, state}, where ``phase`` matches the strings the
// SandboxDetailDrawer already polls via cowork.get_sandbox_detail
// ("upgrading:pulling", "running", "upgrade_failed", ...). The drawer consumes
// it as a live accelerator while keeping its 2.5s poll as a fallback.
export const ADMIN = {
    SANDBOX_UPGRADE_PROGRESS: 'SANDBOX_UPGRADE_PROGRESS',
};
