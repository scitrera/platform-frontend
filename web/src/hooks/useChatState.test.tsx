// SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import type {ChatMessage} from '@scitrera/messaging-spec';
import {ChatStateProvider, useChatState} from './useChatState';

const message = (id: string, text: string): ChatMessage => ({
    schema_version: '1.0', id, role: 'assistant', created_at: '2026-01-01T00:00:00Z',
    content: [{type: 'text', text}], addr: {}, meta: {}, ref: null,
});
const wrapper = ({children}: {children: React.ReactNode}) =>
    <ChatStateProvider>{children}</ChatStateProvider>;

describe('history snapshots racing live chat', () => {
    it.each([false, true])('preserves a live approval when delayed history includes stale message: %s', stale => {
        const {result} = renderHook(useChatState, {wrapper});
        act(() => result.current.beginSpecHistoryLoad());
        act(() => {
            result.current.dispatchSpecEvent({event: 'message_started', message: message('live', '')});
            result.current.dispatchSpecEvent({
                event: 'part_appended', message_id: 'live', index: 1,
                part: {type: 'approval_request', id: 'permission', tool: 'apply_patch', status: 'pending', options: ['once']},
            });
            result.current.upsertSpecMessage({...message('user', 'write a note'), role: 'user'});
        });
        act(() => result.current.setSpecMessagesList([
            message('saved', 'previous conversation'), ...(stale ? [message('live', 'old snapshot')] : []),
        ]));
        expect(result.current.specMessages.live.content[1]).toMatchObject({type: 'approval_request', status: 'pending'});
        expect(result.current.specMessages.user.content[0]).toMatchObject({text: 'write a note'});
        expect(result.current.specMessages.saved).toBeTruthy();
        act(() => result.current.dispatchSpecEvent({
            event: 'message_finalized', message_id: 'live', message: message('live', 'completed after approval'),
        }));
        expect(result.current.specMessages.live.content[0]).toMatchObject({text: 'completed after approval'});
    });

    it('accepts authoritative history after a new refresh boundary', () => {
        const {result} = renderHook(useChatState, {wrapper});
        act(() => result.current.upsertSpecMessage(message('live', 'partial before disconnect')));
        act(() => result.current.beginSpecHistoryLoad());
        act(() => result.current.setSpecMessagesList([message('live', 'completed on the server')]));
        expect(result.current.specMessages.live.content[0]).toMatchObject({text: 'completed on the server'});
    });

    it('does not preserve messages from the thread that was cleared', () => {
        const {result} = renderHook(useChatState, {wrapper});
        act(() => result.current.upsertSpecMessage(message('old-thread', 'private previous thread')));
        act(() => result.current.clearSpecMessages());
        act(() => result.current.setSpecMessagesList([message('new-thread', 'selected thread')]));
        expect(Object.keys(result.current.specMessages)).toEqual(['new-thread']);
    });
});

describe('interleaved tasks in the same chat thread', () => {
    it('keeps the new turn active when an older background task starts or completes', () => {
        const {result} = renderHook(useChatState, {wrapper});
        const current = {taskId: 'new', messageId: 'new-message', startedAt: 200};
        act(() => result.current.setActiveChatTask('_default', current));
        act(() => result.current.setActiveChatTask('_default', {taskId: 'old', messageId: 'old-message', startedAt: 100}));
        act(() => result.current.clearActiveChatTask('_default', 'old'));
        expect(result.current.getActiveChatTaskForThread('_default')).toEqual(current);
        act(() => result.current.clearActiveChatTask('_default', 'new'));
        expect(result.current.getActiveChatTaskForThread('_default')).toBeNull();
    });
});

describe('conversation work profiles', () => {
    it('retains the profile after creation, list refresh and reselection', () => {
        const {result} = renderHook(useChatState, {wrapper});
        const thread = {id: 'review-thread', name: 'Review', workProfile: 'review', lastActivity: null};
        act(() => result.current.createThread(thread));
        expect(result.current.getActiveThread()?.workProfile).toBe('review');
        act(() => result.current.setThreadsList([thread]));
        act(() => result.current.selectThread('_default'));
        expect(result.current.getActiveThread()?.workProfile).toBeFalsy();
        act(() => result.current.selectThread('review-thread'));
        expect(result.current.getActiveThread()?.workProfile).toBe('review');
    });
});
