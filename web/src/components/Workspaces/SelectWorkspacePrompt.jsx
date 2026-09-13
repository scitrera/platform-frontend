import React, {useState} from 'react';
import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import NewWorkspaceModal from './CreateWorkspaceDialog.jsx';
import LazyLucideIcon from "../UI/LazyLucideIcon.jsx";
import {titleCase} from "../../lib/utils";

// Component displayed when no workspace is selected.
const SelectWorkspacePrompt = ({message, workspaceTitle = 'workspace'}) => {
    const [creating, setCreating] = useState(false);
    const canCreate = useAuthStore(s => !!s.userInfo?.permissions?.canCreateWorkspaces);
    const showPrivate = useAuthStore(s => s.uiConfig.showPrivateWorkspace !== false);
    const workspaces = useWorkspaceStore(s => s.workspaces);
    const loading = useWorkspaceStore(s => s.isLoadingWorkspaces);
    const selectWorkspace = useWorkspaceStore(s => s.setCurrentWorkspace);
    const choices = [...(workspaces.shared || []), ...(workspaces.private || [])]
        .filter(ws => (showPrivate && ws.id === '_private')
            || (!ws.id.startsWith('_') && !ws.id.startsWith('workspace:')));
    return (

        <div className="min-h-[60vh] flex items-center justify-center p-4">
            <NewWorkspaceModal open={creating} onOpenChange={setCreating}/>
            <div className="relative w-full max-w-3xl">
                {/* Soft background glow */}
                <div
                    className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-blue-20 to-indigo-50 blur-lg"></div>

                <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
                    <div className="px-8 py-10 sm:py-12">
                        {/* Icon header */}
                        <div className="flex items-center justify-center gap-3">
                                <span
                                    className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-blue-100">
                                    <LazyLucideIcon iconName="PanelLeft" className="h-6 w-6 text-blue-600"/>
                                </span>
                            <span
                                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-100">
                                    <LazyLucideIcon iconName="MousePointerClick" className="h-6 w-6 text-amber-600"/>
                                </span>
                            <span
                                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
                                    <LazyLucideIcon iconName="Sparkles" className="h-6 w-6 text-emerald-600"/>
                                </span>
                        </div>

                        {/* Title */}
                        <h2 className="mt-6 text-center text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                            Select a {workspaceTitle} to get started
                        </h2>
                        {message ?
                            <p className="mt-2 text-center text-slate-600">{message}</p> :
                            <p className="mt-2 text-center text-slate-600">
                                Choose an existing {workspaceTitle}{canCreate ? " or create a new one" : ""} to continue.
                            </p>
                        }

                        <div className="mt-8 space-y-4">
                            {canCreate && <div className="flex justify-center">
                                <button type="button" onClick={() => setCreating(true)}
                                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                                    <LazyLucideIcon iconName="Plus" className="h-4 w-4"/>
                                    Create {workspaceTitle}
                                </button>
                            </div>}
                            {loading ? <p role="status" className="text-center text-sm text-slate-500">Loading {workspaceTitle}s…</p>
                                : choices.length ? <div aria-label={`${titleCase(workspaceTitle)}s`} className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                                    {choices.map(ws => <button key={ws.id} type="button" onClick={() => selectWorkspace(ws.id)}
                                        className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-slate-800 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600">
                                        <LazyLucideIcon iconName="FolderOpen" className="h-5 w-5 shrink-0 text-blue-600"/>
                                        <span className="min-w-0 break-words">{ws.label}</span>
                                    </button>)}
                                </div> : <p className="text-center text-sm text-slate-500">
                                    {canCreate ? `No ${workspaceTitle}s yet. Create one to get started.`
                                        : `No ${workspaceTitle}s are available. Ask your administrator for access.`}
                                </p>}
                        </div>

                        {/* Decorative bottom accent */}
                        <div
                            className="mt-10 h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent"/>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SelectWorkspacePrompt;