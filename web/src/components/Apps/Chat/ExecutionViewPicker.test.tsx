import React, {useCallback, useState} from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useWebSocket} from '@/hooks/useWebSocket.jsx';
import {ExecutionViewPicker, type ExecutionSelection} from './ExecutionViewPicker';

vi.mock('@/hooks/useWebSocket.jsx', () => ({
    useWebSocket: vi.fn(),
}));

describe('ExecutionViewPicker', () => {
    it('selects an exact host read-only before an explicit write expansion', async () => {
        const sendRpcRequest = vi.fn()
            .mockResolvedValueOnce({result: {views: [{
                workspace_id: 'ws-1', view_id: 'view-a', kind: 'git_worktree',
                display_name: 'Feature A',
            }]}})
            .mockResolvedValueOnce({result: {hosts: [{
                binding: {
                    schema_version: '1.0', workspace_id: 'ws-1', view_id: 'view-a',
                    tool_host_id: 'host-a', execution_site: 'client', revision: 'abc123',
                },
                capabilities: ['workspace.read', 'workspace.write'],
                vcs: {branch: 'feature/a', dirty: true},
            }]}});
        // isConnected must be true: the component now gates its effects on it,
        // so an unconnected mock issues no RPCs at all and the picker stays
        // empty — which is the intended behaviour, not a broken test.
        vi.mocked(useWebSocket).mockReturnValue(
            {sendRpcRequest, isConnected: true} as unknown as ReturnType<typeof useWebSocket>,
        );
        const onSelect = vi.fn<(selection: ExecutionSelection | null) => void>();

        function Harness() {
            const [selection, setSelection] = useState<ExecutionSelection | null>(null);
            const handleSelect = useCallback((next: ExecutionSelection | null) => {
                onSelect(next);
                setSelection(next);
            }, []);
            return <ExecutionViewPicker
                workspaceId="ws-1"
                value={selection}
                onSelect={handleSelect}
            />;
        }

        render(<Harness/>);
        await waitFor(() => expect(screen.getByRole('option', {name: 'Feature A'})).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Execution view'), {target: {value: 'view-a'}});
        await waitFor(() => expect(screen.getByRole('option', {name: /host-a/})).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Execution host'), {target: {value: 'host-a'}});

        expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({
            binding: expect.objectContaining({
                workspace_id: 'ws-1', view_id: 'view-a', tool_host_id: 'host-a',
            }),
            policy: {write_access: 'read_only'},
        }));
        onSelect.mockClear();
        fireEvent.click(screen.getByLabelText(/write/));
        expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({
            policy: {
                write_access: 'read_write',
                allow_mutable_view: true,
                allow_dirty_view: true,
            },
        }));
    });
});
