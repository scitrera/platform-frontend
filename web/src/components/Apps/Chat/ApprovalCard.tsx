import React, {memo, useMemo, useState} from 'react';
import {
    ShieldQuestion, ShieldCheck, ShieldX, Clock, ChevronDown, ChevronRight, X,
} from 'lucide-react';
import type {ApprovalRequestPart, ApprovalStatus} from '@scitrera/messaging-spec';
import {cn} from '@/lib/utils';
import {CHAT} from '@/constants/WebSocketConstants';
import {useWebSocket} from '@/hooks/useWebSocket.jsx';
import {useChatState} from '@/hooks/useChatState';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {controlToSpecMessage} from '@/utils/messaging/specAdapters';

// Scope → button label (handoff §5). Unknown scopes (forward-compat) fall back
// to the raw scope string so a future option still renders, never crashes.
const SCOPE_LABELS: Record<string, string> = {
    once: 'Allow once',
    session: 'Allow for this session',
    always: 'Always allow',
};
const scopeLabel = (s: string): string => SCOPE_LABELS[s] ?? `Allow (${s})`;

// A pending request with no explicit options is still answerable — offer a
// single bare "approve" so the user isn't stuck. We do NOT invent extra scopes
// beyond what the request lists (handoff §9: don't infer scopes not in options).
const resolveOptions = (options: string[] | null | undefined): string[] =>
    (Array.isArray(options) && options.length > 0) ? options : ['once'];

interface ResolvedView {
    icon: typeof ShieldCheck;
    label: string;
    cls: string;
}

function resolvedView(status: ApprovalStatus | string): ResolvedView {
    switch (status) {
        case 'approved':
            return {icon: ShieldCheck, label: 'Approved', cls: 'text-emerald-600'};
        case 'denied':
            return {icon: ShieldX, label: 'Denied', cls: 'text-red-600'};
        case 'expired':
            return {icon: Clock, label: 'Expired — not answered in time', cls: 'text-gray-400'};
        default:
            // Forward-compat: unknown terminal status — show it, don't crash.
            return {icon: ShieldQuestion, label: String(status), cls: 'text-gray-400'};
    }
}

// ─── The permission card ──────────────────────────────────────────────
//
// Rendered inline at the approval_request part's position in the assistant
// message. Self-contained: it routes the user's decision to the in-flight
// task (same task the cancel button targets) by building a spec ControlPart
// and sending it on CHAT.CONTROL; the authoritative resolution comes back as
// a part_updated that flips `status`.
export const ApprovalCard = memo(({part}: {part: ApprovalRequestPart}) => {
    const {sendMessage} = useWebSocket();
    const {activeThreadId, getActiveChatTaskForThread} = useChatState();
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);

    const status = part.status as ApprovalStatus;
    const pending = status === 'pending';

    const options = useMemo(() => resolveOptions(part.options), [part.options]);

    const [argsOpen, setArgsOpen] = useState(false);
    const [confirmAlways, setConfirmAlways] = useState(false);
    // Optimistic local lock after we send a decision: disable the controls and
    // reflect "waiting" until the authoritative part_updated lands (handoff §8).
    const [submitted, setSubmitted] = useState<{kind: string; scope?: string} | null>(null);

    const argsText = useMemo(() => {
        if (part.args == null) return '';
        try {
            return typeof part.args === 'string' ? part.args : JSON.stringify(part.args, null, 2);
        } catch {
            return String(part.args);
        }
    }, [part.args]);

    const activeTask = getActiveChatTaskForThread
        ? getActiveChatTaskForThread(activeThreadId)
        : null;
    const taskId = activeTask?.taskId || '';

    const send = (kind: 'approve' | 'deny', scope?: string) => {
        if (submitted) return;
        if (!taskId) return; // no in-flight task to address — leave card inert
        const specMessage = controlToSpecMessage({
            kind,
            taskId,
            requestId: part.id,
            scope,
            workspaceId: currentWorkspaceId,
            threadId: activeThreadId,
        });
        sendMessage(CHAT.CONTROL, {
            workspace: currentWorkspaceId,
            threadId: activeThreadId,
            taskId,
            message: specMessage,
        });
        setSubmitted({kind, scope});
    };

    const onApprove = (scope: string) => {
        // `always` is a durable workspace grant — guard against reflex clicks
        // with a one-step confirm (handoff §5).
        if (scope === 'always' && !confirmAlways) {
            setConfirmAlways(true);
            return;
        }
        send('approve', scope);
    };

    // Reviewable args toggle, shared by the pending card and the resolved row.
    const detailsToggle = argsText ? (
        <button
            type="button"
            onClick={() => setArgsOpen(o => !o)}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
            {argsOpen ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
            {argsOpen ? 'Hide details' : 'View details'}
        </button>
    ) : null;
    const detailsPre = argsOpen && argsText ? (
        <pre className="mx-2.5 mb-2 max-h-48 overflow-auto rounded bg-gray-50 border border-gray-100 p-2 text-[11px] text-gray-700 whitespace-pre-wrap break-words">
            {argsText}
        </pre>
    ) : null;

    // Resolved (or forward-compat unknown non-terminal) cards carry no actions,
    // so collapse them to a single row: icon + decision + tool + description,
    // with the details accordion pushed to the right. Keeps after-the-fact
    // approvals compact instead of the old four-row stack.
    if (!pending) {
        const view = resolvedView(status);
        return (
            <div className="my-1 rounded-md border border-gray-200 bg-white text-sm">
                <div className="flex items-center gap-2 px-2.5 py-1">
                    <view.icon size={14} className={cn('shrink-0', view.cls)} aria-hidden/>
                    <span className={cn('font-medium shrink-0', view.cls)}>{view.label}</span>
                    <code className="shrink-0 px-1 py-0.5 rounded bg-gray-100 text-[11px] font-mono text-gray-600">
                        {part.tool}
                    </code>
                    {part.summary && (
                        <span className="min-w-0 truncate text-gray-600" title={part.summary}>
                            {part.summary}
                        </span>
                    )}
                    {detailsToggle && <span className="ml-auto shrink-0">{detailsToggle}</span>}
                </div>
                {detailsPre}
            </div>
        );
    }

    return (
        <div className="my-2 rounded-lg border border-amber-300 shadow-sm bg-white text-sm">
            {/* Header: tool + summary */}
            <div className="flex items-start gap-2 px-3 pt-2.5">
                <ShieldQuestion size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden/>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800">Permission required</span>
                        <code className="px-1.5 py-0.5 rounded bg-gray-100 text-[11px] font-mono text-gray-600">
                            {part.tool}
                        </code>
                    </div>
                    {part.summary && (
                        <div className="mt-0.5 text-gray-700 break-words">{part.summary}</div>
                    )}
                    {part.reason && (
                        <div className="mt-0.5 text-xs text-gray-400 break-words">{part.reason}</div>
                    )}
                </div>
            </div>

            {/* Reviewable args (collapsible) */}
            {detailsToggle && (
                <div className="px-3 pt-1.5">
                    {detailsToggle}
                    {detailsPre}
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <button
                    type="button"
                    onClick={() => send('deny')}
                    disabled={Boolean(submitted) || !taskId}
                    className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                        'border-gray-300 text-gray-600 hover:bg-gray-50',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                >
                    <X size={12}/> Deny
                </button>

                {options.map(scope => {
                    const isAlways = scope === 'always';
                    const armed = isAlways && confirmAlways;
                    return (
                        <button
                            key={scope}
                            type="button"
                            onClick={() => onApprove(scope)}
                            disabled={Boolean(submitted) || !taskId}
                            title={isAlways ? 'Persists for this workspace' : undefined}
                            className={cn(
                                'inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                                'disabled:opacity-50 disabled:cursor-not-allowed',
                                isAlways
                                    ? (armed
                                        ? 'border-amber-500 bg-amber-500 text-white hover:bg-amber-600'
                                        : 'border-amber-400 text-amber-700 hover:bg-amber-50')
                                    : 'border-blue-500 bg-blue-500 text-white hover:bg-blue-600',
                            )}
                        >
                            {armed ? 'Click to confirm' : scopeLabel(scope)}
                        </button>
                    );
                })}

                {submitted && (
                    <span className="text-xs text-gray-400">Waiting…</span>
                )}
                {!taskId && (
                    <span className="text-xs text-gray-400">No active turn to answer</span>
                )}
            </div>
        </div>
    );
});
ApprovalCard.displayName = 'ApprovalCard';

export default ApprovalCard;
