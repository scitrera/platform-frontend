import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
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
vi.mock('./DynamicAppPlaceholder.jsx', () => ({default: ({appName, showCloseButton, onClose}) =>
    <section aria-label={appName || 'Selected application'}>
        <p>Selected application</p>
        {showCloseButton && <button onClick={onClose}>Close {appName || 'App'}</button>}
    </section>}));
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


describe('app pane header policy', () => {
    beforeEach(() => {
        state.workspace.availableApps = [{id: 'review', name: 'Review'}, {id: 'other', name: 'Other'}];
        state.panels.main = {id: 'review'};
        state.panels.secondary = {id: '_preview', title: 'Preview'};
        state.panels.closeMainApp = vi.fn();
        state.panels.closeApp2 = vi.fn();
    });

    it('labels an internal preview and hides only its close control when disabled', () => {
        state.panels.secondary.closeable = false;
        render(<AppArea/>);
        expect(screen.getByRole('region', {name: 'Preview'})).toBeVisible();
        expect(screen.queryByRole('button', {name: 'Close Preview'})).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Close Review'}));
        expect(state.panels.closeMainApp).toHaveBeenCalledOnce();
    });

    it('keeps independent secondary panes closeable by default', () => {
        render(<AppArea/>);
        fireEvent.click(screen.getByRole('button', {name: 'Close Preview'}));
        expect(state.panels.closeApp2).toHaveBeenCalledOnce();
    });

    it.each([
        ['ordinary app', {}, 2, undefined, true],
        ['single app', {}, 1, undefined, false],
        ['default app', {default_app: 'review'}, 2, undefined, false],
        ['app-only workspace', {mode: 'app-only'}, 2, undefined, false],
        ['no-chat workspace', {mode: 'no-chat'}, 2, undefined, false],
        ['explicit disable', {}, 2, false, false],
        ['explicit enable', {mode: 'app-only'}, 1, true, true],
    ])('%s uses the expected main-pane close policy', (_label, workspace, count, closeable, expected) => {
        state.workspace.currentWorkspaceInfo = workspace;
        state.workspace.availableApps = state.workspace.availableApps.slice(0, count);
        state.panels.main.closeable = closeable;
        render(<AppArea/>);
        expect(Boolean(screen.queryByRole('button', {name: 'Close Review'}))).toBe(expected);
    });

    it.each(['scitrera.ai', 'review'])('resolves legacy placeholder %s while preserving explicit titles', (placeholder) => {
        state.panels.main.title = placeholder;
        state.panels.secondary = {id: 'other', title: 'Custom title'};
        render(<AppArea/>);
        expect(screen.getByRole('region', {name: 'Review'})).toBeVisible();
        expect(screen.getByRole('region', {name: 'Custom title'})).toBeVisible();
    });
});
