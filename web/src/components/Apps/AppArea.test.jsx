import React from 'react';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import AppArea from './AppArea';

const state = vi.hoisted(() => ({auth: {}, workspace: {}, panels: {}}));
vi.mock('@/stores/authStore', () => ({useAuthStore: selector => selector(state.auth)}));
vi.mock('@/stores/workspaceStore', () => ({useWorkspaceStore: selector => selector(state.workspace)}));
vi.mock('@/stores/appPanelStore', () => ({useAppPanelStore: selector => selector(state.panels)}));
vi.mock('./Admin/AdminDashboardApp', () => ({default: () => null}));
vi.mock('./WorkspaceSettings/WorkspaceSettingsApp', () => ({default: () => null}));
vi.mock('./Knowledgebase/KnowledgebaseApp', () => ({default: () => null}));
vi.mock('./Library/LibraryApp', () => ({default: () => null}));
vi.mock('./Sharing/SharingApp', () => ({default: () => null}));
vi.mock('./DocViewer/DocumentViewerApp', () => ({default: () => null}));
vi.mock('./DynamicAppPlaceholder.jsx', () => ({default: () => <p>Selected application</p>}));
vi.mock('../Workspaces/SelectWorkspacePrompt.jsx', () => ({default: () => <p>Select workspace</p>}));
vi.mock('../Auth/UnauthenticatedPlaceholder.jsx', () => ({default: () => <p>Sign in</p>}));
vi.mock('./SelectApplicationPrompt.jsx', () => ({default: ({dynamicLoad}) =>
    <p>{dynamicLoad ? 'Tenant app-selection prompt' : 'Default app-selection prompt'}</p>}));

beforeEach(() => {
    state.auth = {isAuthenticated: true, uiConfig: {chatEnabled: false}};
    state.workspace = {currentWorkspaceId: 'default', currentWorkspaceInfo: {}, availableApps: []};
    state.panels = {main: null, secondary: null, appLayout: 'horizontal', appSplit: 50};
});

describe('empty application area', () => {
    it('loads the tenant placeholder when global chat is disabled', () => {
        render(<AppArea/>);
        expect(screen.getByText('Tenant app-selection prompt')).toBeVisible();
    });
    it('preserves the chat-led empty layout when chat is enabled', () => {
        state.auth.uiConfig.chatEnabled = true;
        render(<AppArea/>);
        expect(screen.queryByText('Tenant app-selection prompt')).not.toBeInTheDocument();
    });
    it('shows workspace selection before the app placeholder', () => {
        state.workspace.currentWorkspaceId = null;
        render(<AppArea/>);
        expect(screen.getByText('Select workspace')).toBeVisible();
        expect(screen.queryByText('Tenant app-selection prompt')).not.toBeInTheDocument();
    });
    it('returns to the placeholder after the last app closes', () => {
        state.panels.main = {id: 'document-review', type: 'dynamic'};
        const {rerender} = render(<AppArea/>);
        expect(screen.getByText('Selected application')).toBeVisible();
        state.panels.main = null;
        rerender(<AppArea/>);
        expect(screen.getByText('Tenant app-selection prompt')).toBeVisible();
    });
});
