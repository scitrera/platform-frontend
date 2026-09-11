import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import Sidebar from './Sidebar.jsx';
import {useAuthStore} from '../../stores/authStore';
import {useWorkspaceStore} from '../../stores/workspaceStore';
import {useUIStore} from '../../stores/uiStore';

vi.mock('../../hooks/useWebSocket.jsx', () => ({useWebSocket: () => ({isConnected: false, dynamicJSXContent: {}})}));
vi.mock('../Workspaces/WorkspacesSidebar.jsx', () => ({default: () => <div>workspace-list</div>}));
vi.mock('../Apps/AppsSidebar.jsx', () => ({default: () => <div>app-list</div>}));
vi.mock('../Apps/DynamicJSXRenderer.jsx', () => ({default: () => <div>dynamic-sidebar</div>}));

beforeEach(() => {
    useAuthStore.setState({uiConfig: {workspacesLabel: 'workspaces', applicationsLabel: 'applications', showWorkspacesSidebar: true, showAppsSidebar: true}});
    useWorkspaceStore.setState({currentWorkspaceId: 'one', availableApps: [{id: 'example', name: 'Example'}] as any});
    useUIStore.setState({sidebarCollapsed: false});
});

it('preserves manual sidebar selection until the workspace changes', () => {
    render(<Sidebar/>);
    expect(screen.getByText('Applications')).toBeVisible();
    fireEvent.click(screen.getByTitle('Workspaces'));
    expect(screen.getByText('Workspaces')).toBeVisible();
    act(() => useUIStore.setState({sidebarCollapsed: true}));
    act(() => useUIStore.setState({sidebarCollapsed: false}));
    expect(screen.getByText('Workspaces')).toBeVisible();
    act(() => useWorkspaceStore.setState({currentWorkspaceId: 'two'}));
    expect(screen.getByText('Applications')).toBeVisible();
});

it('returns to workspace navigation when no apps are available', () => {
    render(<Sidebar/>);
    expect(screen.getByText('Applications')).toBeVisible();
    act(() => useWorkspaceStore.setState({availableApps: []}));
    expect(screen.getByText('Workspaces')).toBeVisible();
    expect(screen.queryByTitle('Applications')).toBeNull();
});
