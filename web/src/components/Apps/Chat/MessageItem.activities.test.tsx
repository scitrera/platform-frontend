/**
 * Activity grouping in the message bubble.
 *
 * Tool calls, reasoning traces and resolved approvals are distinct spec part
 * types but read to the user as the same thing — the agent working. They
 * collapse together into one "N activities" banner so only the latest /
 * in-progress / action-required row stays surfaced.
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

// ApprovalCard talks to the live socket + chat state; neither exists here.
vi.mock('@/hooks/useWebSocket.jsx', () => ({
    useWebSocket: () => ({sendMessage: vi.fn(), sendRpcRequest: vi.fn()}),
}));
vi.mock('@/hooks/useChatState', () => ({
    useChatState: () => ({
        activeThreadId: 'thr',
        getActiveChatTaskForThread: () => ({taskId: 'task_1'}),
        selectThread: vi.fn(),
        upsertThread: vi.fn(),
    }),
}));

function makeMessage(content: ContentPart[]): ChatMessage {
    return {
        schema_version: MESSAGING_SCHEMA_VERSION,
        id: 'msg_activities',
        role: 'assistant',
        created_at: '2026-08-17T00:00:00Z',
        content,
        addr: {tenant_id: 't', workspace_id: 'w', thread_id: 'thr'},
        meta: {},
        ref: null,
    };
}

const toolCall = (id: string, name: string, status = 'completed') => ([
    {type: 'tool_call', id, name, args: {path: `${id}.md`}, status},
    {type: 'tool_result', call_id: id, name, output: 'ok', is_error: false},
] as ContentPart[]);

describe('MessageItem — activity grouping', () => {
    it('collapses a finished mixed run into one "N activities" banner', async () => {
        const {MessageItem} = await import('./MessageItem');
        const msg = makeMessage([
            {type: 'reasoning', text: 'let me look', redacted: false},
            ...toolCall('tc_1', 'read_file'),
            {
                type: 'approval_request', id: 'ap_1', tool: 'run_command',
                summary: 'rm -rf build', status: 'approved', options: ['once'],
            },
            ...toolCall('tc_2', 'run_command'),
            {type: 'text', text: 'All done.'},
        ] as ContentPart[]);

        render(<MessageItem msg={msg}/>);

        // Reasoning + 2 tool calls + 1 resolved approval = 4 activities, behind
        // one banner. Nothing from the run is visible until it's expanded.
        const banner = screen.getByText('4 activities');
        expect(screen.queryByText('read_file')).not.toBeInTheDocument();
        expect(screen.queryByText('Reasoning')).not.toBeInTheDocument();
        expect(screen.queryByText('Approved')).not.toBeInTheDocument();
        // The answer itself is never part of the run.
        expect(screen.getByText('All done.')).toBeInTheDocument();

        fireEvent.click(banner);
        expect(screen.getByText('Reasoning')).toBeInTheDocument();
        expect(screen.getByText('read_file')).toBeInTheDocument();
        // Both the approval row and the tool row badge the same tool name.
        expect(screen.getAllByText('run_command')).toHaveLength(2);
        expect(screen.getByText('Approved')).toBeInTheDocument();
    });

    it('surfaces the last activity of a trailing run and collapses the backlog', async () => {
        const {MessageItem} = await import('./MessageItem');
        const msg = makeMessage([
            {type: 'reasoning', text: 'first thought', redacted: false},
            ...toolCall('tc_1', 'read_file'),
            {type: 'tool_call', id: 'tc_2', name: 'run_command', args: {cmd: 'make'}, status: 'running'},
        ] as ContentPart[]);

        render(<MessageItem msg={msg}/>);

        // The in-flight call stays visible; the two earlier activities collapse.
        expect(screen.getByText('run_command')).toBeInTheDocument();
        expect(screen.getByText('running')).toBeInTheDocument();
        const banner = screen.getByText('2 earlier activities');
        expect(screen.queryByText('read_file')).not.toBeInTheDocument();

        fireEvent.click(banner);
        expect(screen.getByText('read_file')).toBeInTheDocument();
        expect(screen.getByText('Reasoning')).toBeInTheDocument();
    });

    it('never buries a pending approval — it breaks the run and stays surfaced', async () => {
        const {MessageItem} = await import('./MessageItem');
        const msg = makeMessage([
            {type: 'reasoning', text: 'this needs permission', redacted: false},
            ...toolCall('tc_1', 'read_file'),
            {
                type: 'approval_request', id: 'ap_1', tool: 'run_command',
                summary: 'rm -rf build', status: 'pending', options: ['once', 'session'],
            },
        ] as ContentPart[]);

        render(<MessageItem msg={msg}/>);

        // Action required → the card renders on its own, outside any banner.
        expect(screen.getByText('Permission required')).toBeInTheDocument();
        expect(screen.getByText('Allow once')).toBeInTheDocument();
        // ...and everything before it is the backlog, fully collapsed.
        expect(screen.getByText('2 activities')).toBeInTheDocument();
        expect(screen.queryByText('read_file')).not.toBeInTheDocument();
    });

    it('leaves a lone activity as a plain row (no banner)', async () => {
        const {MessageItem} = await import('./MessageItem');
        const msg = makeMessage([
            ...toolCall('tc_1', 'read_file'),
            {type: 'text', text: 'Done.'},
        ] as ContentPart[]);

        render(<MessageItem msg={msg}/>);

        expect(screen.getByText('read_file')).toBeInTheDocument();
        expect(screen.queryByText(/activit(y|ies)/)).not.toBeInTheDocument();
    });
});
