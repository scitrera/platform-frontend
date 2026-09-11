/**
 * WorkspacePicker — compact dropdown for selecting the active workspace.
 *
 * Fetches the workspace list from the server via `client.listWorkspaces()` on
 * mount (or when the client transitions to connected). The currently selected
 * workspace is lifted to the parent via the `onSelect` callback.
 *
 * Visual contract: fits comfortably in a narrow task pane (~320-400 px).
 * The trigger is a small badge-style button; the dropdown opens below it.
 * Keyboard: Arrow keys navigate, Enter/Space select, Escape closes.
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ChevronDown, Loader, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { WorkspaceInfo, WorkspacesListResult } from '../../ws/tools-wss-client';
import type { ToolsWssClient } from '../../ws/tools-wss-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkspacePickerProps {
  /** The ToolsWssClient instance — must be connected before calling. */
  client: ToolsWssClient;
  /** The currently selected workspace (controlled). */
  value: WorkspaceInfo | null;
  /** Called when the user picks a workspace. */
  onSelect: (workspace: WorkspaceInfo) => void;
  /** If true, the picker is disabled (e.g. not yet connected). */
  disabled?: boolean;
}

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkspacePicker({ client, value, onSelect, disabled = false }: WorkspacePickerProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // ---------------------------------------------------------------------------
  // Fetch workspaces
  // ---------------------------------------------------------------------------

  const fetchWorkspaces = useCallback(() => {
    setFetchState('loading');
    client
      .listWorkspaces()
      .then((result: WorkspacesListResult) => {
        setWorkspaces(result.workspaces);
        setFetchState('ready');
      })
      .catch((err: unknown) => {
        console.error('[WorkspacePicker] listWorkspaces failed:', err);
        setFetchState('error');
      });
  }, [client]);

  // Fetch on mount; caller should re-mount or pass a new client when reconnecting.
  // We use void to kick off the async fetch without blocking the effect cleanup.
  useEffect(() => {
    void Promise.resolve().then(fetchWorkspaces);
  }, [fetchWorkspaces]);

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedIndex(workspaces.findIndex((w) => w.id === value?.id) ?? 0);
          setOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, workspaces.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
        case ' ': {
          e.preventDefault();
          const ws = workspaces[focusedIndex];
          if (ws) {
            onSelect(ws);
            setOpen(false);
            triggerRef.current?.focus();
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
          break;
        case 'Tab':
          setOpen(false);
          break;
      }
    },
    [open, workspaces, focusedIndex, onSelect, value],
  );

  // Scroll focused item into view
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.children[focusedIndex];
    if (item instanceof HTMLElement) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const trigger = triggerRef.current;
      const list = listRef.current;
      if (
        trigger &&
        !trigger.contains(e.target as Node) &&
        list &&
        !list.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const label = value?.name ?? 'Select workspace';
  const isDisabled = disabled || fetchState === 'loading';

  return (
    <div className="relative inline-flex items-center">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Workspace: ${label}`}
        onClick={() => {
          if (!isDisabled) {
            setFocusedIndex(workspaces.findIndex((w) => w.id === value?.id) ?? 0);
            setOpen((prev) => !prev);
          }
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          'bg-blue-50 text-blue-700 hover:bg-blue-100',
          'disabled:opacity-50 disabled:pointer-events-none',
          !value && fetchState === 'ready' && 'bg-amber-50 text-amber-700 hover:bg-amber-100',
        )}
      >
        {fetchState === 'loading' && <Loader size={11} className="animate-spin" />}
        {fetchState === 'error' && <AlertCircle size={11} />}
        <span className="max-w-[120px] truncate">{label}</span>
        {fetchState !== 'loading' && <ChevronDown size={11} />}
      </button>

      {/* Error retry chip */}
      {fetchState === 'error' && (
        <button
          type="button"
          onClick={fetchWorkspaces}
          className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs text-red-600 bg-red-50 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          aria-label="Retry loading workspaces"
        >
          <RefreshCw size={10} />
          Retry
        </button>
      )}

      {/* Dropdown list */}
      {open && fetchState === 'ready' && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Available workspaces"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className={cn(
            'absolute z-50 top-full left-0 mt-1',
            'min-w-[160px] max-w-[240px] max-h-48 overflow-y-auto',
            'rounded-md border border-gray-200 bg-white shadow-md',
            'py-1 text-xs',
          )}
        >
          {workspaces.length === 0 ? (
            <li className="px-3 py-2 text-gray-400 select-none">No workspaces found</li>
          ) : (
            workspaces.map((ws, idx) => (
              <li
                key={ws.id}
                role="option"
                aria-selected={ws.id === value?.id}
                onClick={() => {
                  onSelect(ws);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={cn(
                  'px-3 py-1.5 cursor-pointer select-none truncate',
                  'hover:bg-blue-50 hover:text-blue-700',
                  idx === focusedIndex && 'bg-blue-50 text-blue-700',
                  ws.id === value?.id && 'font-semibold',
                )}
              >
                {ws.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
