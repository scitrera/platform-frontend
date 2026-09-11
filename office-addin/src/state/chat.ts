/**
 * Chat state types and reducer (spec-driven).
 *
 * Phase 5 (Route 2): chat state is now a map of spec ChatMessages keyed by
 * id, mutated by ``StreamEvent``s arriving on the ``chat/stream`` JSON-RPC
 * notification. The legacy text-blob ``Message`` reducer is gone; the
 * renderer walks ``ChatMessage.content`` directly.
 */
import {
  applyEvent,
  MESSAGING_SCHEMA_VERSION,
  type ChatMessage,
  type ContentPart,
  type MessageState,
  type StreamEvent,
} from '@scitrera/messaging-spec';
import { generateUUID } from '../lib/utils';

// ---------------------------------------------------------------------------
// Workspace types (mirrored from workspaces/list protocol)
// ---------------------------------------------------------------------------

export interface WorkspaceInfo {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Connection / progress types (unchanged from v1)
// ---------------------------------------------------------------------------

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'auth-required'
  | 'offline';

export interface ProgressInfo {
  taskId: string;
  kind: string;
  summary?: string;
  completion?: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface ChatState {
  threadId: string;
  /** Spec ChatMessage map keyed by message id (mutated by APPLY_SPEC_EVENT). */
  specMessages: MessageState;
  pendingTaskId: string | null;
  connectionState: ConnectionState;
  progress: ProgressInfo | null;
  currentWorkspace: WorkspaceInfo | null;
  availableWorkspaces: WorkspaceInfo[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type ChatAction =
  | { type: 'NEW_THREAD' }
  | {
      type: 'ADD_USER_MESSAGE';
      text: string;
      id?: string;
      attachments?: string[];
      documents?: string[];
    }
  | { type: 'APPLY_SPEC_EVENT'; event: StreamEvent }
  | { type: 'SET_HISTORY'; messages: ChatMessage[] }
  | { type: 'CLEAR' }
  | { type: 'SET_STREAMING_DONE' }
  | { type: 'SET_CONNECTION_STATE'; state: ConnectionState }
  | { type: 'SET_PROGRESS'; progress: ProgressInfo | null }
  | { type: 'CLEAR_PENDING_TASK' }
  | { type: 'SET_PENDING_TASK'; taskId: string }
  | { type: 'WORKSPACES_LOADED'; workspaces: WorkspaceInfo[] }
  | { type: 'WORKSPACE_CHANGED'; workspace: WorkspaceInfo };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function makeInitialState(): ChatState {
  return {
    threadId: generateUUID(),
    specMessages: {},
    pendingTaskId: null,
    connectionState: 'connecting',
    progress: null,
    currentWorkspace: null,
    availableWorkspaces: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a spec ChatMessage for a user input.
 *
 * Mirrors ``frontend/src/utils/messaging/specAdapters.ts::userInputToSpecMessage``
 * (paraphrased, not imported — the office-addin can't reach into the main
 * frontend's package tree).
 */
export function userInputToSpecMessage(
  text: string,
  opts: {
    id?: string;
    workspaceId?: string | null;
    threadId?: string | null;
    appId?: string | null;
    attachments?: string[];
    documents?: string[];
  } = {},
): ChatMessage {
  const content: ContentPart[] = [];
  if (text) content.push({ type: 'text', text });
  for (const ref of opts.attachments ?? []) {
    if (!ref) continue;
    content.push({ type: 'file', vfs_ref: ref, purpose: 'attachment' });
  }
  for (const ref of opts.documents ?? []) {
    if (!ref) continue;
    content.push({ type: 'file', vfs_ref: ref, purpose: 'document' });
  }
  return {
    schema_version: MESSAGING_SCHEMA_VERSION,
    id: opts.id ?? generateUUID(),
    role: 'user',
    created_at: new Date().toISOString(),
    content,
    addr: {
      workspace_id: opts.workspaceId ?? null,
      thread_id: opts.threadId ?? null,
      app_id: opts.appId ?? null,
    },
    meta: {},
    ref: null,
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * Render-order list of spec ChatMessages.
 *
 * Sorted by ``created_at`` ascending; messages without a parseable
 * ``created_at`` fall back to insertion order (stable sort preserves the
 * tie-break).
 */
export function chatMessageList(state: ChatState): ChatMessage[] {
  const msgs = Object.values(state.specMessages);
  const withIdx = msgs.map((m, i) => ({ m, i, t: parseCreatedAt(m.created_at) }));
  withIdx.sort((a, b) => {
    if (a.t === null && b.t === null) return a.i - b.i;
    if (a.t === null) return 1;
    if (b.t === null) return -1;
    if (a.t === b.t) return a.i - b.i;
    return a.t - b.t;
  });
  return withIdx.map((x) => x.m);
}

function parseCreatedAt(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'NEW_THREAD':
      return {
        ...state,
        threadId: generateUUID(),
        specMessages: {},
        pendingTaskId: null,
        progress: null,
      };

    case 'ADD_USER_MESSAGE': {
      const msg = userInputToSpecMessage(action.text, {
        id: action.id,
        threadId: state.threadId,
        workspaceId: state.currentWorkspace?.id ?? null,
        attachments: action.attachments,
        documents: action.documents,
      });
      return {
        ...state,
        specMessages: { ...state.specMessages, [msg.id]: msg },
      };
    }

    case 'APPLY_SPEC_EVENT': {
      const next = applyEvent(state.specMessages, action.event);
      if (next === state.specMessages) return state;
      return { ...state, specMessages: next };
    }

    case 'SET_HISTORY': {
      const map: Record<string, ChatMessage> = {};
      for (const m of action.messages) {
        map[m.id] = m;
      }
      return { ...state, specMessages: map };
    }

    case 'CLEAR':
      return {
        ...state,
        specMessages: {},
        pendingTaskId: null,
        progress: null,
      };

    case 'SET_STREAMING_DONE':
      return { ...state, pendingTaskId: null, progress: null };

    case 'SET_CONNECTION_STATE':
      return { ...state, connectionState: action.state };

    case 'SET_PROGRESS':
      return { ...state, progress: action.progress };

    case 'SET_PENDING_TASK':
      return { ...state, pendingTaskId: action.taskId };

    case 'CLEAR_PENDING_TASK':
      return { ...state, pendingTaskId: null };

    case 'WORKSPACES_LOADED': {
      // Auto-select the first workspace if none is selected yet.
      const autoSelect =
        state.currentWorkspace === null && action.workspaces.length > 0
          ? action.workspaces[0] ?? null
          : state.currentWorkspace;
      return {
        ...state,
        availableWorkspaces: action.workspaces,
        currentWorkspace: autoSelect,
      };
    }

    case 'WORKSPACE_CHANGED':
      // Switching workspace resets the active thread so threads from the
      // previous workspace don't bleed into the new context.
      return {
        ...state,
        currentWorkspace: action.workspace,
        specMessages: {},
        pendingTaskId: null,
        threadId: generateUUID(),
        progress: null,
      };

    default:
      return state;
  }
}
