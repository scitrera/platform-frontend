/**
 * Chat-related type definitions used by useChatState, chat components,
 * and the chat rail.
 *
 * Phase 4: ``ChatMessage`` (the spec shape from ``@scitrera/messaging-spec``)
 * is the source of truth for chat-message rendering. The legacy
 * frontend-shape ``ChatMessage`` defined here is retained ONLY for the
 * narrow surfaces that still adapt to the legacy ``ToolCall`` /
 * ``Citation`` / ``DynamicContentBlock`` types (``ToolCallDisplay`` /
 * ``CitationList`` / ``DynamicContentList``). Phase 7 deletes it.
 */

// ─── Attachments / Documents ────────────────────────────────────────

export type AttachmentStatus = 'uploading' | 'done' | 'error';

export interface Attachment {
    id: string;
    label: string;
    key: string | null;
    progress?: number;
    status?: AttachmentStatus;
    cancelFn?: (() => void) | null;
}

export interface ChatDocument {
    id: string;
    label: string;
    progress?: number;
}

// ─── Tool calls ─────────────────────────────────────────────────────

export type ToolCallStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface ToolCall {
    id: string;
    name: string;
    args?: unknown;
    result?: string;
    status: ToolCallStatus;
}

// ─── Citations ──────────────────────────────────────────────────────

export interface Citation {
    title?: string;
    url?: string;
    source?: string;
    snippet?: string;
}

// ─── Dynamic content blocks ─────────────────────────────────────────

export interface DynamicContentBlock {
    kind?: string;
    mime?: string;
    filename?: string;
    data_base64?: string;
    doc_id?: string;
    data?: DynamicContentBlock;
    [key: string]: unknown;
}

// ─── Threads ────────────────────────────────────────────────────────

/**
 * Canonical id of the workspace-default ("Quick Chat") thread.
 *
 * This is THE single representation of the default thread everywhere in the
 * frontend — state, task-map keys, and every backend interaction. The one
 * exception is URL serialization, which renders it as blank for a cleaner
 * URL (see ChatBody). It matches the backend canonical value
 * (``scitrera_ai_runtime.core.common.RTEventGateway.DEFAULT_THREAD_ID``),
 * so no translation is needed across the wire.
 */
export const DEFAULT_THREAD_ID = '_default';

export interface WorkProfileOption {
    id: string;
    name: string;
}

export interface ChatThread {
    /** Profile bound when this conversation was created; empty means personal. */
    workProfile?: string;
    // Never null: the default thread uses ``DEFAULT_THREAD_ID`` as its id.
    id: string;
    name: string;
    lastActivity: Date | number | null;
    // Parent thread id for a sub-thread (subagent child), else null/absent
    // for a top-level thread. Mirrors MemoryLayer's ``chat_threads.parent_thread``
    // (surfaced by the app-server thread-list projection as ``parentThreadId``).
    parentThreadId?: string | null;
}

// ─── Progress / active task ─────────────────────────────────────────

export interface ProgressUpdate {
    name?: string;
    message?: string;
    detail?: string;
    [key: string]: unknown;
}

export interface ActiveTaskInfo {
    taskId: string;
    messageId: string;
    startedAt: number;
}

export type ActiveTaskByThread = Record<string, ActiveTaskInfo>;
