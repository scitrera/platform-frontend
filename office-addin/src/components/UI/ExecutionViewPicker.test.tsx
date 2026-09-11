import React, {useCallback, useState} from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import type {ToolsWssClient} from '../../ws/tools-wss-client';
import {ExecutionViewPicker, type ExecutionSelection} from './ExecutionViewPicker';

describe('ExecutionViewPicker', () => {
  it('selects an exact live host and makes write expansion explicit', async () => {
    const client = {
      listWorkspaceViews: vi.fn().mockResolvedValue({
        workspace_id: 'ws-1',
        views: [{
          workspace_id: 'ws-1', view_id: 'view-a', kind: 'git_worktree',
          display_name: 'Feature A',
        }],
      }),
      listWorkspaceViewHosts: vi.fn().mockResolvedValue({
        workspace_id: 'ws-1', view_id: 'view-a',
        hosts: [{
          binding: {
            schema_version: '1.0', workspace_id: 'ws-1', view_id: 'view-a',
            tool_host_id: 'host-a', execution_site: 'worker', revision: 'abc123',
          },
          capabilities: ['workspace.read', 'workspace.write'],
          observed_at: '2026-08-12T12:00:00Z',
          vcs: {branch: 'feature/a', dirty: true},
        }],
      }),
    } as unknown as ToolsWssClient;
    const onSelect = vi.fn<(selection: ExecutionSelection | null) => void>();
    function Harness() {
      const [selection, setSelection] = useState<ExecutionSelection | null>(null);
      const handleSelect = useCallback((next: ExecutionSelection | null) => {
        onSelect(next);
        setSelection(next);
      }, []);
      return <ExecutionViewPicker
        client={client}
        workspaceId="ws-1"
        value={selection}
        onSelect={handleSelect}
      />;
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('option', {name: 'Feature A'})).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Execution view'), {target: {value: 'view-a'}});
    await waitFor(() => expect(screen.getByRole('option', {name: /host-a/})).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Execution host'), {target: {value: 'host-a'}});

    const readOnly = onSelect.mock.calls[onSelect.mock.calls.length - 1]?.[0];
    expect(readOnly).toMatchObject({
      binding: {workspace_id: 'ws-1', view_id: 'view-a', tool_host_id: 'host-a'},
      policy: {write_access: 'read_only'},
    });

    await waitFor(() => expect(screen.getByLabelText(/write/)).toBeInTheDocument());
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
