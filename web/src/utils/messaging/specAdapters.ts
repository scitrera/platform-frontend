/**
 * Boundary adapters between the legacy WS payload shape and the universal
 * messaging-spec ChatMessage shape.
 *
 * Phase 4: the production chat UI consumes ``specMessages`` directly, but
 * the backend ``CHAT.HISTORY`` payload + the ``CHAT.APPEND_MESSAGE`` echo
 * are still in the legacy ``{sender, text, toolCalls, segments,
 * citations, dynamic, attachments, timestamp}`` shape. These helpers
 * convert into the spec ``ChatMessage`` shape so downstream consumers
 * never see the legacy fields again.
 *
 * TODO(phase-7): once the backend ships native spec payloads on the
 * history wire, retire ``legacyHistoryToSpec`` (the
 * ``userInputToSpecMessage`` helper for outbound messages stays).
 */
import {
    type ChatMessage as SpecChatMessage,
    type ContentPart,
    type Role,
    type TodoPart,
    MESSAGING_SCHEMA_VERSION,
} from '@scitrera/messaging-spec';
import {generateId} from '@/lib/utils';

interface LegacyToolCall {
    id?: string;
    name?: string;
    args?: unknown;
    result?: unknown;
    status?: string;
}

interface LegacyCitation {
    title?: string;
    url?: string;
    source?: string;
    snippet?: string;
}

interface LegacyDynamicBlock {
    kind?: string;
    mime?: string;
    filename?: string;
    data_base64?: string;
    doc_id?: string;
    data?: LegacyDynamicBlock;
    [key: string]: unknown;
}

interface LegacySegment {
    type?: string;
    text?: string;
    id?: string;
}

export interface LegacyHistoryMessage {
    id?: string;
    timestamp?: number | string | null;
    sender?: string;
    text?: string;
    toolCalls?: LegacyToolCall[] | null;
    segments?: LegacySegment[] | null;
    citations?: LegacyCitation[] | null;
    dynamic?: LegacyDynamicBlock[] | null;
    attachments?: Array<string | {id?: string; key?: string; label?: string}> | null;
}

const toIsoTimestamp = (ts: number | string | null | undefined): string | null => {
    if (ts == null) return null;
    if (typeof ts === 'string') return ts;
    if (typeof ts === 'number' && Number.isFinite(ts)) {
        // Backend chat history uses Unix seconds (float ok).
        return new Date(ts * 1000).toISOString();
    }
    return null;
};

const senderToRole = (sender: string | undefined): Role => {
    if (sender === 'user') return 'user';
    if (sender === 'system') return 'system';
    if (sender === 'tool') return 'tool';
    return 'assistant';
};

const mapToolStatus = (
    raw: string | undefined,
): 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' => {
    if (raw === 'running') return 'running';
    if (raw === 'cancelled') return 'cancelled';
    if (raw === 'failed' || raw === 'error') return 'failed';
    if (raw === 'pending') return 'pending';
    return 'completed';
};

/**
 * Convert a single legacy-shape chat history message into a spec
 * ChatMessage. Walks the legacy ``segments`` interleave when present so
 * tool calls land at their original position; falls back to text + tool
 * footer otherwise.
 */
export function legacyMessageToSpec(msg: LegacyHistoryMessage): SpecChatMessage {
    const sender = msg.sender || 'assistant';
    const role = senderToRole(sender);
    const ts = msg.timestamp ?? null;
    const id =
        msg.id
        || (typeof ts === 'number' && Number.isFinite(ts)
            ? `msg_${ts}_${sender}`
            : generateId('msg'));

    const content: ContentPart[] = [];

    // tool_call lookup so segments can produce both tool_call and
    // (when a result is attached) the paired tool_result.
    const toolCallsById = new Map<string, LegacyToolCall>();
    if (Array.isArray(msg.toolCalls)) {
        for (const tc of msg.toolCalls) {
            if (tc && tc.id) toolCallsById.set(tc.id, tc);
        }
    }
    const emittedToolIds = new Set<string>();

    const pushToolPair = (tc: LegacyToolCall): void => {
        if (!tc?.id || emittedToolIds.has(tc.id)) return;
        emittedToolIds.add(tc.id);
        const status = mapToolStatus(tc.status);
        content.push({
            type: 'tool_call',
            id: tc.id,
            name: tc.name || '',
            args: (tc.args as Record<string, unknown>) || {},
            status,
        });
        if (tc.result != null && tc.result !== '') {
            const isError = status === 'failed';
            const outputText = typeof tc.result === 'string'
                ? tc.result
                : JSON.stringify(tc.result);
            content.push({
                type: 'tool_result',
                call_id: tc.id,
                name: tc.name || null,
                output: tc.result,
                output_text: outputText,
                is_error: isError,
            });
        }
    };

    const hasSegments = Array.isArray(msg.segments) && msg.segments.length > 0;
    if (hasSegments) {
        for (const seg of msg.segments!) {
            if (!seg || typeof seg !== 'object') continue;
            if (seg.type === 'text' && seg.text) {
                content.push({type: 'text', text: seg.text});
            } else if (seg.type === 'tool' && seg.id) {
                const tc = toolCallsById.get(seg.id);
                if (tc) pushToolPair(tc);
            }
        }
    } else if (msg.text) {
        content.push({type: 'text', text: msg.text});
    }

    // Aggregate any tool calls that weren't surfaced inline (legacy
    // history without segments) so the footer-equivalent path still
    // renders them.
    if (Array.isArray(msg.toolCalls)) {
        for (const tc of msg.toolCalls) {
            if (tc && tc.id) pushToolPair(tc);
        }
    }

    if (Array.isArray(msg.citations)) {
        for (const c of msg.citations) {
            if (!c || typeof c !== 'object') continue;
            content.push({
                type: 'citation',
                source: c.source ?? c.url ?? null,
                title: c.title ?? null,
                snippet: c.snippet ?? null,
                meta: c.url ? {url: c.url} : null,
            });
        }
    }

    if (Array.isArray(msg.dynamic)) {
        for (const block of msg.dynamic) {
            if (!block || typeof block !== 'object') continue;
            // Unwrap defensively: backend ships flat blocks, but historic
            // ``{type:'dynamic', data:{...}}`` shape is also possible.
            const data: LegacyDynamicBlock = (block.data && typeof block.data === 'object')
                ? block.data
                : block;
            const kind = data.kind || 'unknown';
            // Map kind='image' / kind='file' into native spec parts so
            // the renderer doesn't need to peek inside a generic dynamic
            // payload. Anything else passes through as a DynamicPart.
            if (kind === 'image') {
                content.push({
                    type: 'image',
                    mime: data.mime ?? null,
                    vfs_ref: data.doc_id ?? null,
                    data_uri: data.data_base64
                        ? `data:${data.mime || 'application/octet-stream'};base64,${data.data_base64}`
                        : null,
                    alt_text: data.filename ?? null,
                });
            } else if (kind === 'file') {
                content.push({
                    type: 'file',
                    vfs_ref: data.doc_id ?? null,
                    mime: data.mime ?? null,
                    file_name: data.filename ?? null,
                    purpose: 'generated',
                });
            } else {
                content.push({
                    type: 'dynamic',
                    kind,
                    payload: data,
                    interactive: false,
                });
            }
        }
    }

    if (Array.isArray(msg.attachments)) {
        for (const att of msg.attachments) {
            if (att == null) continue;
            if (typeof att === 'string') {
                content.push({
                    type: 'file',
                    vfs_ref: att,
                    purpose: 'attachment',
                });
            } else if (typeof att === 'object') {
                content.push({
                    type: 'file',
                    vfs_ref: att.key ?? att.id ?? null,
                    file_name: att.label ?? null,
                    purpose: 'attachment',
                });
            }
        }
    }

    return {
        schema_version: MESSAGING_SCHEMA_VERSION,
        id,
        role,
        created_at: toIsoTimestamp(ts),
        content,
        addr: {},
        meta: {},
        ref: null,
    };
}

/**
 * Coerce a raw, spec-native history message (as emitted by the app-server
 * history handler, which runs each MemoryLayer record through the lossless
 * ``from_memorylayer_message`` codec) into a well-formed spec ChatMessage.
 *
 * The wire shape is already spec-native, so this only fills defaults for any
 * missing envelope field and drops messages without a usable ``id`` (the
 * specMessages map is keyed by id). It does NOT reshape ``content`` — every
 * part, including ``todo``, rides through verbatim so the board survives reload.
 */
export function coerceSpecMessage(raw: unknown): SpecChatMessage | null {
    if (!raw || typeof raw !== 'object') return null;
    const m = raw as Record<string, unknown>;
    const id = typeof m.id === 'string' && m.id ? m.id : '';
    if (!id) return null;
    const role = senderToRole(typeof m.role === 'string' ? m.role : undefined);
    const content = Array.isArray(m.content) ? (m.content as ContentPart[]) : [];
    const created_at = typeof m.created_at === 'string'
        ? m.created_at
        : (typeof m.created_at === 'number' ? new Date(m.created_at * 1000).toISOString() : null);
    return {
        schema_version: typeof m.schema_version === 'string' ? m.schema_version : MESSAGING_SCHEMA_VERSION,
        id,
        role,
        created_at,
        content,
        addr: (m.addr && typeof m.addr === 'object') ? (m.addr as SpecChatMessage['addr']) : {},
        meta: (m.meta && typeof m.meta === 'object') ? (m.meta as Record<string, unknown>) : {},
        ref: (m.ref && typeof m.ref === 'object') ? (m.ref as SpecChatMessage['ref']) : null,
    };
}

/** Map a spec-native history payload list into coerced spec ChatMessages,
 * dropping any entries without a usable id. */
export function historyToSpecMessages(messages: unknown): SpecChatMessage[] {
    if (!Array.isArray(messages)) return [];
    const out: SpecChatMessage[] = [];
    for (const raw of messages) {
        const msg = coerceSpecMessage(raw);
        if (msg) out.push(msg);
    }
    return out;
}

/**
 * Build a spec ChatMessage for an outbound user input. Mirrors the shape
 * the legacy ``compileMessagePayload({sender:'user', ...})`` produced so
 * the local optimistic insert is identity-equal to what the backend
 * would echo back through history.
 */
export interface SpecAttachmentInput {
    vfs_ref?: string;
    key?: string;
    mime?: string;
    file_name?: string;
}

export function userInputToSpecMessage(input: {
    id?: string;
    text: string;
    attachments?: Array<string | SpecAttachmentInput | null | undefined>;
    documents?: string[];
    timestamp?: number;
    /**
     * Mark this send as an interjection into the turn already running on the
     * thread, rather than the start of a new one. The server does not mint a
     * chat task for it and the agent delivers it into the in-flight turn at
     * that turn's next input-assembly boundary.
     *
     * Only set this while a turn is actually running: a steering message with
     * no turn to join falls back to being an ordinary turn, which is correct
     * but is not what the user asked for.
     */
    steering?: boolean;
}): SpecChatMessage {
    const ts = input.timestamp ?? Date.now() / 1000;
    const id = input.id || `msg_${ts}_user`;
    const content: ContentPart[] = [];
    if (input.text) content.push({type: 'text', text: input.text});
    if (Array.isArray(input.attachments)) {
        for (const att of input.attachments) {
            if (!att) continue;
            // Bare vfs_ref string: the sidecar enriches mime/file_name from the
            // VFS catalog and classifies images, so a plain FilePart is fine.
            if (typeof att === 'string') {
                content.push({type: 'file', vfs_ref: att, purpose: 'attachment'});
                continue;
            }
            const ref = att.vfs_ref ?? att.key;
            if (!ref) continue;
            const mime = att.mime;
            // When the uploader knows the type, emit a first-class ImagePart for
            // images (vision) and a described FilePart otherwise.
            if (mime && mime.toLowerCase().startsWith('image/')) {
                content.push({
                    type: 'image',
                    vfs_ref: ref,
                    mime,
                    alt_text: att.file_name ?? null,
                });
            } else {
                content.push({
                    type: 'file',
                    vfs_ref: ref,
                    mime: mime ?? null,
                    file_name: att.file_name ?? null,
                    purpose: 'attachment',
                });
            }
        }
    }
    if (Array.isArray(input.documents)) {
        for (const docId of input.documents) {
            if (!docId) continue;
            content.push({type: 'file', vfs_ref: docId, purpose: 'document'});
        }
    }
    return {
        schema_version: MESSAGING_SCHEMA_VERSION,
        id,
        role: 'user',
        created_at: new Date(ts * 1000).toISOString(),
        content,
        addr: {},
        // Only set the key when steering, so an ordinary send stays byte-for-byte
        // what it was before this option existed.
        meta: input.steering ? {steering: true} : {},
        ref: null,
    };
}

/**
 * Build a spec ChatMessage carrying user feedback on another message.
 *
 * Spec §3.12: a feedback message is a ``ChatMessage`` with ``role:'user'``
 * (the user is the actor), exactly one ``FeedbackPart`` in ``content``,
 * and ``ref.message_id`` pointing at the target assistant message being
 * rated. ``ref.relationship`` is the string ``'feedback'``.
 *
 * Convention for the legacy UI feedback toggle:
 *   - ``'up'``   → ``sentiment = +1``
 *   - ``'down'`` → ``sentiment = -1``
 *   - ``null``   → ``sentiment =  0`` (cleared / no opinion). The user
 *                  explicitly revoked prior feedback; we still emit a
 *                  spec message so MemoryLayer captures the clearing
 *                  event for analytics (rather than silently dropping).
 */
export function feedbackToSpecMessage(input: {
    targetMessageId: string;
    sentiment: number;
    text?: string | null;
    id?: string;
    timestamp?: number;
}): SpecChatMessage {
    const ts = input.timestamp ?? Date.now() / 1000;
    const id = input.id || `msg_${ts}_feedback`;
    const content: ContentPart[] = [
        {
            type: 'feedback',
            sentiment: input.sentiment,
            text: input.text ?? null,
        },
    ];
    return {
        schema_version: MESSAGING_SCHEMA_VERSION,
        id,
        role: 'user',
        created_at: new Date(ts * 1000).toISOString(),
        content,
        addr: {},
        meta: {},
        ref: {message_id: input.targetMessageId, relationship: 'feedback'},
    };
}

/**
 * Build a spec ChatMessage carrying a single ``control`` part — the user's
 * in-band decision addressed to an in-flight task.
 *
 * Spec §3.11 (control): used for cross-process control signals on the chat
 * wire. The approval flow (APPROVAL_FRONTEND_HANDOFF §4) answers an
 * ``approval_request`` with ``kind: 'approve' | 'deny'``, ``request_id`` equal
 * to the request's ``id``, and (for approve) a ``scope`` of once|session|always.
 * The envelope ``addr`` carries ``task_id`` so it routes to the waiting agent —
 * identical routing to cancel. ``scope`` is omitted for deny.
 *
 * This carrier is outbound-only (sent via CHAT.CONTROL, not inserted into the
 * local message map), and the backend forwards it to the agent transport.
 */
export function controlToSpecMessage(input: {
    kind: string;
    taskId: string;
    requestId?: string | null;
    scope?: string | null;
    workspaceId?: string | null;
    threadId?: string | null;
    id?: string;
    timestamp?: number;
}): SpecChatMessage {
    const ts = input.timestamp ?? Date.now() / 1000;
    const id = input.id || `msg_${ts}_control`;
    const control: Record<string, unknown> = {
        type: 'control',
        kind: input.kind,
        task_id: input.taskId,
    };
    if (input.requestId) control.request_id = input.requestId;
    // scope is meaningful only for grant kinds; deny ignores it (spec §5).
    if (input.scope && input.kind !== 'deny') control.scope = input.scope;
    return {
        schema_version: MESSAGING_SCHEMA_VERSION,
        id,
        role: 'user',
        created_at: new Date(ts * 1000).toISOString(),
        content: [control as ContentPart],
        addr: {
            workspace_id: input.workspaceId ?? null,
            thread_id: input.threadId ?? null,
            task_id: input.taskId,
            request_id: input.requestId ?? null,
        },
        meta: {},
        ref: null,
    };
}

/**
 * Parse the ``created_at`` ISO 8601 timestamp from a spec ChatMessage and
 * return it as milliseconds since epoch (suitable for integer sort
 * comparisons). Returns 0 when the field is absent or unparseable.
 */
export function specMessageTimestamp(msg: SpecChatMessage): number {
    if (msg.created_at) {
        const t = Date.parse(msg.created_at);
        if (!Number.isNaN(t)) return t;
    }
    return 0;
}

/**
 * Select the live TODO board from a chronologically-ordered message list.
 *
 * Spec contract (UNIVERSAL_MESSAGE_SPEC §3.13 / frontend handoff §4): the
 * agent emits a ``todo`` content part with a stable ``id`` (default
 * ``"todo_main"``) and rewrites the full ``items`` list each turn. The live
 * board is therefore the most-recent ``todo`` part in the thread — later wins.
 *
 * v1 renders a single board. If/when multiple concurrent boards (distinct
 * ``id``s, e.g. per-subagent lists) land, swap this for a ``Map<id, TodoPart>``
 * keyed by ``todo.id`` and render one panel per id.
 */
export function latestTodoBoard(messages: SpecChatMessage[]): TodoPart | null {
    let latest: TodoPart | null = null;
    for (const m of messages) {            // oldest → newest (specMessageList is sorted)
        for (const part of m.content) {
            if (part.type === 'todo') {
                latest = part as TodoPart;
            }
        }
    }
    return latest;
}

const STEERING_OPEN_TAG = '[user_steering]';
const STEERING_CLOSE_TAG = '[/user_steering]';

/**
 * Strip the ``[user_steering]`` wrapper the agent adds around a mid-turn
 * interjection.
 *
 * The agent wraps the whole text so the model reads it as an interjection
 * rather than a new task; the tags are protocol, not something the user typed,
 * so they must not reach the screen. Text without the wrapper is returned
 * unchanged, which keeps this safe to call on any message.
 */
export function stripSteeringWrapper(text: string): string {
    const trimmed = text.trim();
    if (!trimmed.startsWith(STEERING_OPEN_TAG) || !trimmed.endsWith(STEERING_CLOSE_TAG)) {
        return text;
    }
    return trimmed.slice(STEERING_OPEN_TAG.length, trimmed.length - STEERING_CLOSE_TAG.length).trim();
}

/** Report whether a message is a mid-turn interjection (wrapped by the agent). */
export function isSteeringMessage(msg: SpecChatMessage): boolean {
    const trimmed = rawSpecMessageText(msg).trim();
    return trimmed.startsWith(STEERING_OPEN_TAG) && trimmed.endsWith(STEERING_CLOSE_TAG);
}

/** Concatenate every ``text`` part verbatim, wrapper included. */
function rawSpecMessageText(msg: SpecChatMessage): string {
    let out = '';
    for (const part of msg.content) {
        if (part.type === 'text') {
            const text = (part as {text?: string}).text;
            if (typeof text === 'string') out += text;
        }
    }
    return out;
}

/**
 * Concatenate every ``text`` part of a spec ChatMessage. Used by copy /
 * regenerate / edit handlers which need the user-visible string.
 *
 * A steering interjection is unwrapped here rather than at each call site, so
 * copy and edit yield what the user actually typed.
 */
export function specMessageText(msg: SpecChatMessage): string {
    return stripSteeringWrapper(rawSpecMessageText(msg));
}
