import React, { useEffect, useMemo, useState } from 'react';
import type { ExecutionBinding, WorkspaceViewDescriptor } from '@scitrera/messaging-spec';

import type {
  ToolsWssClient,
  WorkspaceExecutionHost,
} from '../../ws/tools-wss-client';

export interface ExecutionViewPolicy {
  write_access: 'read_only' | 'read_write';
  allow_mutable_view?: boolean;
  allow_dirty_view?: boolean;
}

export interface ExecutionSelection {
  binding: ExecutionBinding;
  policy: ExecutionViewPolicy;
}

interface Props {
  client: ToolsWssClient;
  workspaceId: string | null;
  value: ExecutionSelection | null;
  onSelect: (selection: ExecutionSelection | null) => void;
  disabled?: boolean;
}

export function ExecutionViewPicker({
  client,
  workspaceId,
  value,
  onSelect,
  disabled = false,
}: Props) {
  const [views, setViews] = useState<WorkspaceViewDescriptor[]>([]);
  const [hosts, setHosts] = useState<WorkspaceExecutionHost[]>([]);
  const [viewId, setViewId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      return client.listWorkspaceViews({ workspace: workspaceId, limit: 100 })
        .then((result) => { if (active) setViews(result.views); })
        .catch((error: unknown) => console.error('[ExecutionViewPicker] list views failed:', error))
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [client, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !viewId) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      return client.listWorkspaceViewHosts({ workspace: workspaceId, view_id: viewId, limit: 100 })
        .then((result) => { if (active) setHosts(result.hosts); })
        .catch((error: unknown) => console.error('[ExecutionViewPicker] list hosts failed:', error))
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [client, workspaceId, viewId]);

  const selectedHost = useMemo(
    () => hosts.find((host) => host.binding.tool_host_id === value?.binding.tool_host_id),
    [hosts, value],
  );
  const hostCanWrite = selectedHost?.capabilities.includes('workspace.write') ?? false;

  const chooseHost = (toolHostId: string) => {
    const host = hosts.find((candidate) => candidate.binding.tool_host_id === toolHostId);
    onSelect(host ? { binding: host.binding, policy: { write_access: 'read_only' } } : null);
  };
  const chooseView = (nextViewId: string) => {
    setViewId(nextViewId);
    setHosts([]);
    onSelect(null);
  };

  const setWriteAccess = (write: boolean) => {
    if (!selectedHost || !value) return;
    onSelect({
      binding: selectedHost.binding,
      policy: write
        ? { write_access: 'read_write', allow_mutable_view: true, allow_dirty_view: true }
        : { write_access: 'read_only' },
    });
  };

  const viewLabel = (view: WorkspaceViewDescriptor) => view.display_name || view.view_id;
  const hostLabel = (host: WorkspaceExecutionHost) => {
    const branch = host.vcs?.branch ? ` · ${host.vcs.branch}` : '';
    const dirty = host.vcs?.dirty ? ' · dirty' : '';
    return `${host.binding.execution_site} · ${host.binding.tool_host_id}${branch}${dirty}`;
  };

  return (
    <div className="flex items-center gap-1 min-w-0" title="Optional filesystem execution view">
      <select
        aria-label="Execution view"
        className="max-w-32 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs"
        value={viewId}
        disabled={disabled || loading || !workspaceId}
        onChange={(event) => chooseView(event.target.value)}
      >
        <option value="">No execution view</option>
        {views.map((view) => <option key={view.view_id} value={view.view_id}>{viewLabel(view)}</option>)}
      </select>
      {viewId && (
        <select
          aria-label="Execution host"
          className="max-w-40 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs"
          value={value?.binding.tool_host_id ?? ''}
          disabled={disabled || loading}
          onChange={(event) => chooseHost(event.target.value)}
        >
          <option value="">Select host</option>
          {hosts.map((host) => (
            <option key={host.binding.tool_host_id} value={host.binding.tool_host_id}>{hostLabel(host)}</option>
          ))}
        </select>
      )}
      {value && (
        <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-gray-600">
          <input
            type="checkbox"
            checked={value.policy.write_access === 'read_write'}
            disabled={disabled || !hostCanWrite}
            onChange={(event) => setWriteAccess(event.target.checked)}
          />
          write (mutable/dirty)
        </label>
      )}
    </div>
  );
}
