/**
 * Regression test for inline reasoning rendering.
 *
 * A tool-loop turn produces ONE reasoning part per model call (the harness
 * appends each iteration's non-tool_call parts, and streams the trace live on
 * its own delta channel). The bubble previously batched them last-wins into a
 * single footer pane, so a multi-call turn showed one "Reasoning" block whose
 * text mutated as the turn progressed and which carried no positional record.
 * Every trace must now render as its own collapsed pane, in content order —
 * inside the surrounding activity run (see ActivityGroup) once the turn has
 * moved on.
 */
import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import type {ChatMessage, ContentPart} from '@scitrera/messaging-spec';
import {MESSAGING_SCHEMA_VERSION} from '@scitrera/messaging-spec';

// Markdown rendering is irrelevant here and drags in the full streamdown /
// remark pipeline; render text parts as plain nodes instead.
vi.mock('./SciMarkdown', () => ({
    SciMarkdown: ({children}: {children: React.ReactNode}) => <div>{children}</div>,
}));

function makeMessage(content: ContentPart[]): ChatMessage {
    return {
        schema_version: MESSAGING_SCHEMA_VERSION,
        id: 'msg_reasoning',
        role: 'assistant',
        created_at: '2026-05-26T00:00:00Z',
        content,
        addr: {tenant_id: 't', workspace_id: 'w', thread_id: 'thr'},
        meta: {},
        ref: null,
    };
}

describe('MessageItem — reasoning parts', () => {
    it('renders one collapsed pane per reasoning part, in content order', async () => {
        const {MessageItem} = await import('./MessageItem');
        const msg = makeMessage([
            {type: 'reasoning', text: 'first I check the file', redacted: false},
            {type: 'tool_call', id: 'tc_1', name: 'read_file', args: {path: 'SOUL.md'}, status: 'completed'},
            {type: 'tool_result', call_id: 'tc_1', name: 'read_file', output: 'ok', is_error: false},
            {type: 'reasoning', text: 'now I can answer', redacted: false},
            {type: 'text', text: 'Here is the answer'},
        ] as ContentPart[]);

        render(<MessageItem msg={msg}/>);

        // The turn moved on to text, so the reasoning + tool run collapsed into
        // one activity banner; expand it to reach the traces.
        fireEvent.click(screen.getByText('3 activities'));

        // Two independent traces — not one last-wins pane.
        const triggers = screen.getAllByText('Reasoning');
        expect(triggers).toHaveLength(2);
        // Panes are collapsed by default (Radix unmounts the closed content).
        triggers.forEach(t => fireEvent.click(t));

        const first = screen.getByText(/first I check the file/);
        const second = screen.getByText(/now I can answer/);
        const answer = screen.getByText('Here is the answer');
        // Positional record: each trace sits where the model produced it.
        expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(second.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows a redacted trace instead of dropping it, and skips empty ones', async () => {
        const {MessageItem} = await import('./MessageItem');
        const msg = makeMessage([
            {type: 'reasoning', text: '', redacted: true},
            {type: 'reasoning', text: '', redacted: false},
            {type: 'text', text: 'answer'},
        ] as ContentPart[]);

        render(<MessageItem msg={msg}/>);

        const triggers = screen.getAllByText('Reasoning');
        expect(triggers).toHaveLength(1);
        fireEvent.click(triggers[0]);
        expect(screen.getByText('(redacted)')).toBeInTheDocument();
    });
});
