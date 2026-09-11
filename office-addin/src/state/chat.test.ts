/**
 * Unit tests for the spec-driven chat reducer.
 */
import { describe, it, expect } from 'vitest';
import type {
  ChatMessage,
  MessageFinalizedEvent,
  MessageStartedEvent,
  PartAppendedEvent,
  TextPart,
  TokenDeltaEvent,
} from '@scitrera/messaging-spec';
import {
  chatMessageList,
  chatReducer,
  makeInitialState,
  userInputToSpecMessage,
  type ChatState,
} from './chat';

function makeAssistantMessage(id: string, createdAt: string): ChatMessage {
  return {
    schema_version: '1.0',
    id,
    role: 'assistant',
    created_at: createdAt,
    content: [],
    addr: {},
    meta: {},
    ref: null,
  };
}

describe('chatReducer — APPLY_SPEC_EVENT round trip', () => {
  it('replays message_started → part_appended → token_delta → message_finalized', () => {
    let state: ChatState = makeInitialState();

    const msgId = 'm1';
    const startedAt = '2026-05-26T12:00:00.000Z';
    const seed = makeAssistantMessage(msgId, startedAt);
    const started: MessageStartedEvent = {
      event: 'message_started',
      message: seed,
    };
    state = chatReducer(state, { type: 'APPLY_SPEC_EVENT', event: started });

    expect(state.specMessages[msgId]).toBeDefined();
    expect(state.specMessages[msgId]?.content).toHaveLength(0);

    const initialTextPart: TextPart = { type: 'text', text: '' };
    const appended: PartAppendedEvent = {
      event: 'part_appended',
      message_id: msgId,
      index: 0,
      part: initialTextPart,
    };
    state = chatReducer(state, { type: 'APPLY_SPEC_EVENT', event: appended });

    expect(state.specMessages[msgId]?.content).toHaveLength(1);
    expect((state.specMessages[msgId]?.content[0] as TextPart).text).toBe('');

    const delta1: TokenDeltaEvent = {
      event: 'token_delta',
      message_id: msgId,
      index: 0,
      text: 'Hello',
    };
    state = chatReducer(state, { type: 'APPLY_SPEC_EVENT', event: delta1 });

    const delta2: TokenDeltaEvent = {
      event: 'token_delta',
      message_id: msgId,
      index: 0,
      text: ', world',
    };
    state = chatReducer(state, { type: 'APPLY_SPEC_EVENT', event: delta2 });

    expect((state.specMessages[msgId]?.content[0] as TextPart).text).toBe(
      'Hello, world',
    );

    const finalText: TextPart = { type: 'text', text: 'Hello, world!' };
    const finalMessage: ChatMessage = {
      ...seed,
      content: [finalText],
    };
    const finalized: MessageFinalizedEvent = {
      event: 'message_finalized',
      message_id: msgId,
      message: finalMessage,
    };
    state = chatReducer(state, { type: 'APPLY_SPEC_EVENT', event: finalized });

    expect(state.specMessages[msgId]?.content).toHaveLength(1);
    expect((state.specMessages[msgId]?.content[0] as TextPart).text).toBe(
      'Hello, world!',
    );
  });
});

describe('chatReducer — ADD_USER_MESSAGE', () => {
  it('produces a spec ChatMessage with role=user + text + file parts', () => {
    const initial: ChatState = {
      ...makeInitialState(),
      threadId: 'thread-1',
      currentWorkspace: { id: 'ws-1', name: 'Test Workspace' },
    };

    const state = chatReducer(initial, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-msg-1',
      text: 'Hi there',
      attachments: ['vfs://file-a'],
      documents: ['vfs://doc-b'],
    });

    const msg = state.specMessages['user-msg-1'];
    expect(msg).toBeDefined();
    expect(msg?.role).toBe('user');
    expect(msg?.schema_version).toBe('1.0');
    expect(msg?.addr.thread_id).toBe('thread-1');
    expect(msg?.addr.workspace_id).toBe('ws-1');

    expect(msg?.content).toHaveLength(3);
    expect(msg?.content[0]).toMatchObject({ type: 'text', text: 'Hi there' });
    expect(msg?.content[1]).toMatchObject({
      type: 'file',
      vfs_ref: 'vfs://file-a',
      purpose: 'attachment',
    });
    expect(msg?.content[2]).toMatchObject({
      type: 'file',
      vfs_ref: 'vfs://doc-b',
      purpose: 'document',
    });
  });

  it('skips text part when the user input is empty', () => {
    const state = chatReducer(makeInitialState(), {
      type: 'ADD_USER_MESSAGE',
      id: 'user-msg-2',
      text: '',
      attachments: ['vfs://only-attachment'],
    });

    const msg = state.specMessages['user-msg-2'];
    expect(msg?.content).toHaveLength(1);
    expect(msg?.content[0]).toMatchObject({ type: 'file' });
  });
});

describe('userInputToSpecMessage helper', () => {
  it('builds a spec ChatMessage carrying the addr fields', () => {
    const msg = userInputToSpecMessage('hi', {
      id: 'fixed-id',
      workspaceId: 'ws-x',
      threadId: 't-x',
      appId: 'app-x',
    });
    expect(msg.id).toBe('fixed-id');
    expect(msg.role).toBe('user');
    expect(msg.addr.workspace_id).toBe('ws-x');
    expect(msg.addr.thread_id).toBe('t-x');
    expect(msg.addr.app_id).toBe('app-x');
    expect(msg.content[0]).toMatchObject({ type: 'text', text: 'hi' });
  });

  it('round-trips to a chat/send wire payload preserving addr + content', () => {
    // Phase 6: the same helper output should be usable both as the
    // optimistic insert AND as the wire ``message`` field — this
    // mirrors how ``ChatApp.handleSend`` reuses it for both paths.
    const specMessage = userInputToSpecMessage('round-trip text', {
      id: 'rt-id',
      workspaceId: 'ws-rt',
      threadId: 't-rt',
      attachments: ['vfs://attachment-1'],
    });

    // Simulate JSON-RPC serialisation roundtrip on the wire.
    const wire = JSON.parse(JSON.stringify(specMessage));
    expect(wire.schema_version).toBe('1.0');
    expect(wire.id).toBe('rt-id');
    expect(wire.role).toBe('user');
    expect(wire.addr.workspace_id).toBe('ws-rt');
    expect(wire.addr.thread_id).toBe('t-rt');
    expect(wire.content).toEqual([
      { type: 'text', text: 'round-trip text' },
      { type: 'file', vfs_ref: 'vfs://attachment-1', purpose: 'attachment' },
    ]);
  });
});

describe('chatReducer — SET_HISTORY', () => {
  it('populates specMessages keyed by message id', () => {
    const m1 = makeAssistantMessage('hist-1', '2026-05-26T11:00:00.000Z');
    const m2 = makeAssistantMessage('hist-2', '2026-05-26T11:05:00.000Z');

    const state = chatReducer(makeInitialState(), {
      type: 'SET_HISTORY',
      messages: [m1, m2],
    });

    expect(Object.keys(state.specMessages)).toHaveLength(2);
    expect(state.specMessages['hist-1']?.id).toBe('hist-1');
    expect(state.specMessages['hist-2']?.id).toBe('hist-2');
  });
});

describe('chatMessageList selector', () => {
  it('returns messages sorted by created_at ascending', () => {
    const earlier = makeAssistantMessage('a', '2026-05-26T10:00:00.000Z');
    const later = makeAssistantMessage('b', '2026-05-26T10:05:00.000Z');

    // Insert in reverse order to prove the sort works.
    const state = chatReducer(makeInitialState(), {
      type: 'SET_HISTORY',
      messages: [later, earlier],
    });

    const list = chatMessageList(state);
    expect(list.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('chatReducer — NEW_THREAD / CLEAR', () => {
  it('NEW_THREAD resets specMessages and generates a fresh threadId', () => {
    const initial = chatReducer(makeInitialState(), {
      type: 'ADD_USER_MESSAGE',
      id: 'tmp-1',
      text: 'will be cleared',
    });
    const prevThread = initial.threadId;

    const next = chatReducer(initial, { type: 'NEW_THREAD' });
    expect(Object.keys(next.specMessages)).toHaveLength(0);
    expect(next.threadId).not.toBe(prevThread);
    expect(next.pendingTaskId).toBeNull();
  });

  it('CLEAR drops messages but keeps threadId', () => {
    const initial = chatReducer(makeInitialState(), {
      type: 'ADD_USER_MESSAGE',
      id: 'tmp-2',
      text: 'will be cleared',
    });
    const next = chatReducer(initial, { type: 'CLEAR' });
    expect(Object.keys(next.specMessages)).toHaveLength(0);
    expect(next.threadId).toBe(initial.threadId);
  });
});
