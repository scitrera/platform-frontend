import React, {useEffect, useMemo, useState} from 'react';

import {USER} from '@/constants/WebSocketConstants.jsx';
import {useWebSocket} from '@/hooks/useWebSocket.jsx';

export interface ExecutionBinding {
    schema_version: '1.0';
    workspace_id: string;
    view_id: string;
    tool_host_id: string;
    execution_site: 'client' | 'worker' | 'remote';
    root_ref?: string;
    relative_directory?: string;
    revision?: string;
}

export interface ExecutionViewPolicy {
    write_access: 'read_only' | 'read_write';
    allow_mutable_view?: boolean;
    allow_dirty_view?: boolean;
}

export interface ExecutionSelection {
    binding: ExecutionBinding;
    policy: ExecutionViewPolicy;
}

interface WorkspaceView {
    workspace_id: string;
    view_id: string;
    kind: string;
    display_name?: string;
}

interface ExecutionHost {
    binding: ExecutionBinding;
    capabilities: string[];
    vcs?: {branch?: string; dirty?: boolean};
}

interface Props {
    workspaceId: string | null;
    value: ExecutionSelection | null;
    onSelect: (selection: ExecutionSelection | null) => void;
    disabled?: boolean;
}

export function ExecutionViewPicker({workspaceId, value, onSelect, disabled = false}: Props) {
    // isConnected gates the effects below. Without it they fire on mount —
    // before the socket exists, since connect() only runs after the /checkz
    // probe resolves — and log a failure on every page load. `sendRpcRequest`
    // changes identity when the connection state does, so the effects re-run
    // and succeed once connected; the early attempt was never anything but
    // noise. Not specific to this component (~175 call sites share the
    // pattern); see sendRpcRequest for the general fix.
    const {sendRpcRequest, isConnected} = useWebSocket();
    const [views, setViews] = useState<WorkspaceView[]>([]);
    const [hosts, setHosts] = useState<ExecutionHost[]>([]);
    const [viewId, setViewId] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isConnected || !workspaceId) return;
        let active = true;
        void Promise.resolve().then(() => {
            if (!active) return;
            setLoading(true);
            return sendRpcRequest<{result: {views: WorkspaceView[]}}>(USER.TOOL_CALL, {
                service: 'platform_bridge',
                op: 'workspace_views.list',
                workspaceId,
                args: {limit: 100},
            }).then((response) => {
                if (active) setViews(response.result.views);
            }).catch((error: unknown) => {
                console.error('[ExecutionViewPicker] list views failed:', error);
            }).finally(() => {
                if (active) setLoading(false);
            });
        });
        return () => { active = false; };
    }, [isConnected, sendRpcRequest, workspaceId]);

    useEffect(() => {
        if (!isConnected || !workspaceId || !viewId) return;
        let active = true;
        void Promise.resolve().then(() => {
            if (!active) return;
            setLoading(true);
            return sendRpcRequest<{result: {hosts: ExecutionHost[]}}>(USER.TOOL_CALL, {
                service: 'platform_bridge',
                op: 'workspace_views.list_hosts',
                workspaceId,
                args: {view_id: viewId, limit: 100},
            }).then((response) => {
                if (active) setHosts(response.result.hosts);
            }).catch((error: unknown) => {
                console.error('[ExecutionViewPicker] list hosts failed:', error);
            }).finally(() => {
                if (active) setLoading(false);
            });
        });
        return () => { active = false; };
    }, [isConnected, sendRpcRequest, workspaceId, viewId]);

    const selectedHost = useMemo(
        () => hosts.find(host => host.binding.tool_host_id === value?.binding.tool_host_id),
        [hosts, value],
    );
    const hostCanWrite = selectedHost?.capabilities.includes('workspace.write') ?? false;
    const chooseHost = (hostId: string) => {
        const host = hosts.find(candidate => candidate.binding.tool_host_id === hostId);
        onSelect(host ? {binding: host.binding, policy: {write_access: 'read_only'}} : null);
    };
    const chooseView = (nextViewId: string) => {
        setViewId(nextViewId);
        setHosts([]);
        onSelect(null);
    };
    const setWriteAccess = (write: boolean) => {
        if (!selectedHost) return;
        onSelect({
            binding: selectedHost.binding,
            policy: write
                ? {write_access: 'read_write', allow_mutable_view: true, allow_dirty_view: true}
                : {write_access: 'read_only'},
        });
    };
    const hostLabel = (host: ExecutionHost) => {
        const branch = host.vcs?.branch ? ` · ${host.vcs.branch}` : '';
        const dirty = host.vcs?.dirty ? ' · dirty' : '';
        return `${host.binding.execution_site} · ${host.binding.tool_host_id}${branch}${dirty}`;
    };

    return <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>Execution:</span>
        <select aria-label="Execution view" value={viewId}
                disabled={disabled || loading || !workspaceId}
                onChange={event => chooseView(event.target.value)}
                className="max-w-48 rounded border border-gray-300 bg-white px-2 py-1 text-xs">
            <option value="">No filesystem view</option>
            {views.map(view => <option key={view.view_id} value={view.view_id}>
                {view.display_name || view.view_id}
            </option>)}
        </select>
        {viewId && <select aria-label="Execution host"
                           value={value?.binding.tool_host_id ?? ''}
                           disabled={disabled || loading}
                           onChange={event => chooseHost(event.target.value)}
                           className="max-w-64 rounded border border-gray-300 bg-white px-2 py-1 text-xs">
            <option value="">Select live host</option>
            {hosts.map(host => <option key={host.binding.tool_host_id} value={host.binding.tool_host_id}>
                {hostLabel(host)}
            </option>)}
        </select>}
        {value && <label className="flex items-center gap-1 whitespace-nowrap">
            <input type="checkbox" checked={value.policy.write_access === 'read_write'}
                   disabled={disabled || !hostCanWrite}
                   onChange={event => setWriteAccess(event.target.checked)}/>
            write (mutable/dirty)
        </label>}
    </div>;
}
