import React, {useEffect, useState} from 'react';
import {Settings, AlertTriangle} from 'lucide-react';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useWebSocket} from '../../../hooks/useWebSocket.jsx';
import {WORKSPACE} from '../../../constants/WebSocketConstants.jsx';
import {ConfirmDialog} from '../../Widgets/ConfirmDialog.jsx';

// v1 has a single section; the sections array + nav mirror the admin console so
// more pages (members, connectors, …) can be added here later.
const SECTIONS = [{id: 'overview', label: 'Overview'}];

// ── Overview: workspace name (rename) + Danger Zone (delete) ──────────────
const OverviewSection = ({ws}) => {
    const {sendRpcRequest, sendMessage} = useWebSocket();
    const renameWorkspace = useWorkspaceStore(s => s.renameWorkspace);
    const removeWorkspace = useWorkspaceStore(s => s.removeWorkspace);
    const closeMainApp = useAppPanelStore(s => s.closeMainApp);

    const [title, setTitle] = useState(ws.label);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Resync the field if the workspace (or its label) changes underneath us.
    useEffect(() => {
        setTitle(ws.label);
        setSaved(false);
        setError(null);
    }, [ws.id, ws.label]);

    const trimmed = title.trim();
    const dirty = trimmed.length > 0 && trimmed !== ws.label;
    // The private (home) workspace can be renamed but never deleted.
    const isHome = ws.id === '_private';

    const handleSave = async () => {
        if (!dirty || saving) return;
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            await sendRpcRequest(WORKSPACE.RENAME, {workspaceId: ws.id, title: trimmed});
            renameWorkspace(ws.id, trimmed);          // optimistic local update
            sendMessage(WORKSPACE.GET_WORKSPACES, null); // background server refresh
            setSaved(true);
        } catch (e) {
            setError(e?.message || 'Failed to rename workspace.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setConfirmOpen(false);
        setDeleting(true);
        setError(null);
        try {
            await sendRpcRequest(WORKSPACE.DELETE, {workspaceId: ws.id});
            sendMessage(WORKSPACE.GET_WORKSPACES, null);
            closeMainApp();
            // Drops the workspace from the cached tree; because it's the current
            // workspace, this also clears the selection and resets the panels.
            removeWorkspace(ws.id);
            // Component unmounts as the panels reset — no further state updates.
        } catch (e) {
            setError(e?.message || 'Failed to delete workspace.');
            setDeleting(false);
        }
    };

    return (
        <div className="max-w-2xl">
            <section className="mb-8">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Workspace name</h3>
                <div className="flex items-center gap-2">
                    <input
                        value={title}
                        onChange={(e) => { setTitle(e.target.value); setSaved(false); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                        placeholder="Workspace name"
                        aria-label="Workspace name"
                    />
                    <button
                        onClick={handleSave}
                        disabled={!dirty || saving}
                        className="shrink-0 px-3 py-2 rounded-md text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
                {saved && <p className="mt-1 text-xs text-green-600">Saved.</p>}
                <p className="mt-1 text-xs text-gray-400 font-mono break-all">{ws.id}</p>
            </section>

            {error && (
                <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {!isHome && (
                <section className="mt-10 rounded-md border border-red-200">
                    <div className="px-4 py-2 border-b border-red-200 bg-red-50 rounded-t-md flex items-center gap-2">
                        <AlertTriangle size={15} className="text-red-500"/>
                        <h3 className="text-sm font-semibold text-red-700">Danger Zone</h3>
                    </div>
                    <div className="p-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800">Delete this workspace</p>
                            <p className="text-xs text-gray-500">
                                Permanently removes the workspace and its contents. This cannot be undone.
                            </p>
                        </div>
                        <button
                            onClick={() => setConfirmOpen(true)}
                            disabled={deleting}
                            className="shrink-0 px-3 py-2 rounded-md text-sm border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                            {deleting ? 'Deleting…' : 'Delete'}
                        </button>
                    </div>
                </section>
            )}

            {isHome && (
                <p className="mt-10 text-xs text-gray-400">
                    This is your private home workspace and cannot be deleted.
                </p>
            )}

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Delete workspace?"
                description={`This permanently deletes "${ws.label}" and all of its contents. This action cannot be undone.`}
                confirmLabel="Delete"
                variant="danger"
                onConfirm={handleDelete}
            />
        </div>
    );
};

// ── The workspace settings surface (admin-console-style app) ──────────────
const WorkspaceSettingsApp = () => {
    const ws = useWorkspaceStore(s => s.currentWorkspaceInfo);
    const closeMainApp = useAppPanelStore(s => s.closeMainApp);
    const [active, setActive] = useState('overview');

    if (!ws) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
                No workspace selected.
            </div>
        );
    }
    // The gear is admin-gated, but guard here too (defense in depth).
    if (ws.role !== 'admin') {
        return (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
                You don't have permission to manage this workspace.
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0">
            <aside className="w-48 flex-shrink-0 border-r bg-gray-50 overflow-y-auto">
                <div className="p-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <Settings size={14}/> Settings
                </div>
                <div className="px-3 pb-2 text-sm font-medium text-gray-800 truncate" title={ws.label}>
                    {ws.label}
                </div>
                <ul>
                    {SECTIONS.map((s) => (
                        <li key={s.id}>
                            <button
                                onClick={() => setActive(s.id)}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors ${
                                    active === s.id ? 'bg-white font-medium' : 'text-gray-700'
                                }`}
                            >
                                {s.label}
                            </button>
                        </li>
                    ))}
                </ul>
            </aside>
            <main className="flex-1 min-w-0 min-h-0 overflow-auto">
                <div className="flex items-center justify-between px-6 py-3 border-b">
                    <h2 className="text-lg font-semibold">Workspace Settings</h2>
                    <button onClick={closeMainApp} className="text-sm text-gray-500 hover:text-gray-700">
                        Close
                    </button>
                </div>
                <div className="p-6">
                    {active === 'overview' && <OverviewSection ws={ws}/>}
                </div>
            </main>
        </div>
    );
};

export default WorkspaceSettingsApp;
