/**
 * Universal ChatMessage schema (v1) — TypeScript types (local copy).
 *
 * Mirror of the canonical
 * ``scitrera-ecosystem-messaging-spec/typescript/src/schema.ts`` +
 * ``events.ts``. Re-vendored locally because the spec package is not yet
 * installed as a frontend dependency. JSON round-trips between Python
 * and TS must be identity; if the spec changes, update this file.
 *
 * Phase 2 wiring: the sidecar's ``SpecMessageEmitter`` produces these
 * ``StreamEvent`` payloads which the WS server relays as ``CHAT_STREAM``
 * Socket.IO events. See ``utils/messaging/applyEvent.ts`` for the pure
 * reducer that replays them into a canonical ChatMessage.
 *
 * TODO(phase-2-frontend): replace this file with
 *   ``import {...} from '@scitrera/messaging-spec'``
 *   once the package is wired into ``frontend/package.json``.
 */

export const MESSAGING_SCHEMA_VERSION = '1.0' as const;

// ─── Content parts ───────────────────────────────────────────────────

export type ToolCallStatus =
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface TextPart {
    type: 'text';
    text: string;
    annotations?: Record<string, unknown>[] | null;
    [extra: string]: unknown;
}

export interface ImagePart {
    type: 'image';
    mime?: string | null;
    vfs_ref?: string | null;
    uri?: string | null;
    data_uri?: string | null;
    alt_text?: string | null;
    [extra: string]: unknown;
}

export interface FilePart {
    type: 'file';
    vfs_ref?: string | null;
    uri?: string | null;
    mime?: string | null;
    file_name?: string | null;
    size_bytes?: number | null;
    purpose?: 'attachment' | 'document' | 'generated' | null;
    [extra: string]: unknown;
}

export interface ToolCallPart {
    type: 'tool_call';
    id: string;
    name: string;
    args: Record<string, unknown>;
    status: ToolCallStatus;
    started_at?: string | null;
    finished_at?: string | null;
    meta?: Record<string, unknown> | null;
    [extra: string]: unknown;
}

export interface ToolError {
    type?: string | null;
    message: string;
    [extra: string]: unknown;
}

export interface ToolResultPart {
    type: 'tool_result';
    call_id: string;
    name?: string | null;
    output?: unknown;
    output_text?: string | null;
    is_error: boolean;
    error?: ToolError | null;
    meta?: Record<string, unknown> | null;
    [extra: string]: unknown;
}

export interface CitationPart {
    type: 'citation';
    id?: string | null;
    source?: string | null;
    title?: string | null;
    snippet?: string | null;
    span?: [number, number] | null;
    meta?: Record<string, unknown> | null;
    [extra: string]: unknown;
}

export interface DynamicPart {
    type: 'dynamic';
    kind: string;
    payload?: unknown;
    interactive: boolean;
    [extra: string]: unknown;
}

export interface ReasoningPart {
    type: 'reasoning';
    text: string;
    redacted: boolean;
    [extra: string]: unknown;
}

export type SubagentStatus =
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface SubagentPart {
    type: 'subagent';
    id: string;
    name: string;
    thread_id: string;
    input?: unknown;
    status: SubagentStatus;
    summary?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
    meta?: Record<string, unknown> | null;
    [extra: string]: unknown;
}

/**
 * Catch-all for unknown content-part types. Spec invariant: unknown
 * parts must round-trip verbatim — never drop fields.
 */
export interface UnknownPart {
    type: string;
    [extra: string]: unknown;
}

export type KnownPartType =
    | 'text'
    | 'image'
    | 'file'
    | 'tool_call'
    | 'tool_result'
    | 'citation'
    | 'dynamic'
    | 'reasoning'
    | 'subagent';

const KNOWN_PART_TYPES: ReadonlySet<string> = new Set([
    'text',
    'image',
    'file',
    'tool_call',
    'tool_result',
    'citation',
    'dynamic',
    'reasoning',
    'subagent',
]);

export function isKnownPartType(t: unknown): t is KnownPartType {
    return typeof t === 'string' && KNOWN_PART_TYPES.has(t);
}

export type ContentPart =
    | TextPart
    | ImagePart
    | FilePart
    | ToolCallPart
    | ToolResultPart
    | CitationPart
    | DynamicPart
    | ReasoningPart
    | SubagentPart
    | UnknownPart;

// ─── Envelope ────────────────────────────────────────────────────────

export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface MessageAddress {
    tenant_id?: string | null;
    workspace_id?: string | null;
    user_id?: string | null;
    thread_id?: string | null;
    app_id?: string | null;
    agent_id?: string | null;
    task_id?: string | null;
    request_id?: string | null;
    telemetry?: Record<string, unknown> | null;
    [extra: string]: unknown;
}

export interface MessageRef {
    parent_id?: string | null;
    in_reply_to?: string | null;
    edits_id?: string | null;
    parent_thread_id?: string | null;
    parent_message_id?: string | null;
    [extra: string]: unknown;
}

export interface ChatMessage {
    schema_version: string;
    id: string;
    role: Role;
    created_at?: string | null;
    content: ContentPart[];
    addr: MessageAddress;
    meta: Record<string, unknown>;
    ref?: MessageRef | null;
    [extra: string]: unknown;
}

export function makeChatMessage(input: Partial<ChatMessage> & {id: string; role: Role}): ChatMessage {
    return {
        schema_version: MESSAGING_SCHEMA_VERSION,
        created_at: null,
        content: [],
        addr: {},
        meta: {},
        ref: null,
        ...input,
    };
}

// ─── Streaming events ────────────────────────────────────────────────

export interface MessageStartedEvent {
    event: 'message_started';
    message: ChatMessage;
}

export interface PartAppendedEvent {
    event: 'part_appended';
    message_id: string;
    index: number;
    part: ContentPart;
}

export interface TokenDeltaEvent {
    event: 'token_delta';
    message_id: string;
    index: number;
    text: string;
}

export interface PartUpdatedEvent {
    event: 'part_updated';
    message_id: string;
    index: number;
    patch: Record<string, unknown>;
}

export interface MessageFinalizedEvent {
    event: 'message_finalized';
    message_id: string;
    message: ChatMessage;
}

export type StreamEvent =
    | MessageStartedEvent
    | PartAppendedEvent
    | TokenDeltaEvent
    | PartUpdatedEvent
    | MessageFinalizedEvent;
