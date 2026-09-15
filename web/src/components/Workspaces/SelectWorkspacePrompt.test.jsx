import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import SelectWorkspacePrompt from './SelectWorkspacePrompt.jsx';
import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';

const rpc = vi.hoisted(() => ({sendRpcRequest: vi.fn(), sendMessage: vi.fn()}));
vi.mock('../../hooks/useWebSocket.jsx', () => ({useWebSocket: () => rpc}));
vi.mock('../UI/LazyLucideIcon.jsx', () => ({default: () => null}));

beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().setCurrentWorkspace(null);
    useAuthStore.setState({userInfo: {permissions: {canCreateWorkspaces: true}},
        uiConfig: {showPrivateWorkspace: false, workspacesLabel: 'workspaces', showWorkspaceTemplateSelection: false}});
    useWorkspaceStore.setState({currentWorkspaceId: null, currentWorkspaceInfo: null,
        isLoadingWorkspaces: false, workspaces: {shared: [{id: 'project', label: 'Project One', role: 'rw'}],
            private: [{id: '_private', label: 'My Workspace'}], hidden: [], templates: []}});
});

it('selects a visible workspace and omits personal/internal entries', () => {
    render(<SelectWorkspacePrompt/>);
    expect(screen.queryByText('My Workspace')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Project One'}));
    expect(useWorkspaceStore.getState().currentWorkspaceId).toBe('project');
});

it('creates and selects a workspace using the real creation dialog and RPC envelope', async () => {
    rpc.sendRpcRequest.mockResolvedValue({workspaceData: {id: 'new-project', label: 'New project', role: 'admin'}});
    render(<SelectWorkspacePrompt/>);
    fireEvent.click(screen.getByRole('button', {name: 'Create workspace'}));
    fireEvent.change(screen.getByLabelText('Workspace Title'), {target: {value: 'New project'}});
    fireEvent.click(screen.getByRole('button', {name: 'Create', exact: true}));
    await waitFor(() => expect(useWorkspaceStore.getState().currentWorkspaceId).toBe('new-project'));
    expect(rpc.sendRpcRequest).toHaveBeenCalledWith('WS_CREATE', {title: 'New project', workspaceId: 'new-project', templateId: null});
    expect(rpc.sendMessage).toHaveBeenCalledWith('GET_WORKSPACES', null);
    expect(useAppPanelStore.getState().main).toBeNull();
    expect(useAppPanelStore.getState().secondary).toBeNull();
});

it('does not offer creation to users without permission and handles an empty list', () => {
    useAuthStore.setState({userInfo: {permissions: {canCreateWorkspaces: false}}});
    useWorkspaceStore.setState({workspaces: {shared: [], private: [], hidden: [], templates: []}});
    render(<SelectWorkspacePrompt/>);
    expect(screen.queryByRole('button', {name: 'Create workspace'})).toBeNull();
    expect(screen.getByText(/Ask your administrator for access/)).toBeVisible();
});

it('keeps creation errors visible without selecting a workspace', async () => {
    rpc.sendRpcRequest.mockRejectedValue(new Error('That workspace already exists'));
    render(<SelectWorkspacePrompt/>);
    fireEvent.click(screen.getByRole('button', {name: 'Create workspace'}));
    fireEvent.change(screen.getByLabelText('Workspace Title'), {target: {value: 'Duplicate'}});
    fireEvent.click(screen.getByRole('button', {name: 'Create', exact: true}));
    await waitFor(() => expect(screen.getByText('That workspace already exists')).toBeVisible());
    expect(useWorkspaceStore.getState().currentWorkspaceId).toBeNull();
});

it('shows loading rather than an empty-state message before navigation arrives', () => {
    act(() => useWorkspaceStore.setState({isLoadingWorkspaces: true}));
    render(<SelectWorkspacePrompt/>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading workspaces');
    expect(screen.queryByText(/No workspaces/)).toBeNull();
});
