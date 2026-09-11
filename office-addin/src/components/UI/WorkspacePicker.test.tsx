/**
 * WorkspacePicker component tests.
 * Uses @testing-library/react with a mock ToolsWssClient.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WorkspacePicker } from './WorkspacePicker';
import type { ToolsWssClient, WorkspaceInfo, WorkspacesListResult } from '../../ws/tools-wss-client';

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

function makeMockClient(workspaces: WorkspaceInfo[] = []): ToolsWssClient {
  return {
    listWorkspaces: vi.fn().mockResolvedValue({ workspaces } satisfies WorkspacesListResult),
    // Provide no-op stubs for the rest of the public API so TypeScript is satisfied.
    call: vi.fn(),
    chatSend: vi.fn(),
    chatCancel: vi.fn(),
    notify: vi.fn(),
    connect: vi.fn(),
    close: vi.fn(),
    getState: vi.fn().mockReturnValue('connected'),
    setRequestHandler: vi.fn(),
    setNotificationHandler: vi.fn(),
    removeNotificationHandler: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as ToolsWssClient;
}

const WORKSPACES: WorkspaceInfo[] = [
  { id: 'ws-1', name: 'Marketing' },
  { id: 'ws-2', name: 'Engineering' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkspacePicker', () => {
  let onSelect: (workspace: WorkspaceInfo) => void;

  beforeEach(() => {
    // Cast through unknown to satisfy strict typing — vi.fn() is the mock factory.
    onSelect = vi.fn() as unknown as (workspace: WorkspaceInfo) => void;
  });

  it('shows loading state while fetching workspaces', () => {
    // listWorkspaces never resolves during this test
    const client = {
      ...makeMockClient(),
      listWorkspaces: vi.fn().mockReturnValue(new Promise(() => undefined)),
    } as unknown as ToolsWssClient;

    render(
      <WorkspacePicker
        client={client}
        value={null}
        onSelect={onSelect}
      />,
    );

    // Spinner present (aria-label on trigger includes "Select workspace")
    expect(screen.getByRole('button', { name: /workspace/i })).toBeInTheDocument();
  });

  it('renders selected workspace name after load', async () => {
    const client = makeMockClient(WORKSPACES);
    const selected = WORKSPACES[0] as WorkspaceInfo;

    render(
      <WorkspacePicker
        client={client}
        value={selected}
        onSelect={onSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Marketing/i })).toBeInTheDocument();
    });
  });

  it('opens dropdown and lists workspaces on click', async () => {
    const client = makeMockClient(WORKSPACES);

    render(
      <WorkspacePicker
        client={client}
        value={null}
        onSelect={onSelect}
      />,
    );

    // Wait for fetch to complete
    await waitFor(() => {
      expect(client.listWorkspaces).toHaveBeenCalledTimes(1);
    });

    // Click trigger to open
    fireEvent.click(screen.getByRole('button', { name: /workspace/i }));

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    expect(screen.getByText('Marketing')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
  });

  it('calls onSelect with the chosen workspace when an option is clicked', async () => {
    const client = makeMockClient(WORKSPACES);

    render(
      <WorkspacePicker
        client={client}
        value={null}
        onSelect={onSelect}
      />,
    );

    await waitFor(() => {
      expect(client.listWorkspaces).toHaveBeenCalledTimes(1);
    });

    // Open the dropdown
    fireEvent.click(screen.getByRole('button', { name: /workspace/i }));

    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });

    // Click "Engineering"
    fireEvent.click(screen.getByText('Engineering'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(WORKSPACES[1]);
  });

  it('is disabled when the disabled prop is true', async () => {
    const client = makeMockClient(WORKSPACES);

    render(
      <WorkspacePicker
        client={client}
        value={null}
        onSelect={onSelect}
        disabled
      />,
    );

    await waitFor(() => {
      expect(client.listWorkspaces).toHaveBeenCalledTimes(1);
    });

    const trigger = screen.getByRole('button', { name: /workspace/i });
    expect(trigger).toBeDisabled();
  });

  it('shows retry button on fetch error', async () => {
    const client = {
      ...makeMockClient(),
      listWorkspaces: vi.fn().mockRejectedValue(new Error('network error')),
    } as unknown as ToolsWssClient;

    render(
      <WorkspacePicker
        client={client}
        value={null}
        onSelect={onSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('retries fetch when retry button is clicked', async () => {
    const listWorkspaces = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce({ workspaces: WORKSPACES } satisfies WorkspacesListResult);

    const client = { ...makeMockClient(), listWorkspaces } as unknown as ToolsWssClient;

    render(
      <WorkspacePicker
        client={client}
        value={null}
        onSelect={onSelect}
      />,
    );

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    // After retry, workspaces should load and retry button should disappear
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    expect(listWorkspaces).toHaveBeenCalledTimes(2);
  });
});
