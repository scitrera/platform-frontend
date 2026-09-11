import React, {useState} from 'react';
import {ChevronDown, ChevronRight, Loader2, X, Check, CircleX} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {cn} from '@/lib/utils';
import {useAuthStore} from '@/stores/authStore';
import type {ToolCall, ToolCallStatus} from '@/types/chat';

/**
 * Tool-call presentation for the chat rail.
 *
 * Visual language mirrors the resolved ApprovalCard: each call is a single
 * compact row — status icon + tool-name badge + status word, with an args/result
 * "Details" accordion pushed to the right.
 *
 * A tool call is one flavour of "activity"; runs of consecutive activities
 * (tool calls, reasoning traces, resolved approvals) collapse into a single
 * banner — see ``ActivityGroup``.
 */

// Map raw status values (incl. legacy 'ok'/'success'/'error') onto the
// canonical set the renderer cares about.
export function canonicalStatus(raw: string | undefined): ToolCallStatus {
    if (raw === 'running') return 'running';
    if (raw === 'cancelled') return 'cancelled';
    if (raw === 'failed' || raw === 'error') return 'failed';
    // Legacy + completed default
    return 'completed';
}

interface StatusView {
    icon: LucideIcon;
    cls: string;
    label: string;
    spin?: boolean;
}

function statusView(status: ToolCallStatus): StatusView {
    switch (status) {
        case 'running':
            return {icon: Loader2, cls: 'text-blue-500', label: 'running', spin: true};
        case 'cancelled':
            return {icon: X, cls: 'text-amber-600', label: 'cancelled'};
        case 'failed':
            return {icon: CircleX, cls: 'text-red-500', label: 'failed'};
        default:
            return {icon: Check, cls: 'text-emerald-600', label: 'ok'};
    }
}

const hasDetails = (call: ToolCall): boolean =>
    (call.args !== undefined && call.args !== null) ||
    (call.result !== undefined && call.result !== null) ||
    canonicalStatus(call?.status) === 'running';

const INLINE_ARG_MAX = 60;

/** Collapse whitespace and clamp a value for inline display. */
function clampInline(s: string): string {
    const flat = s.replace(/\s+/g, ' ').trim();
    return flat.length > INLINE_ARG_MAX ? `${flat.slice(0, INLINE_ARG_MAX - 1)}…` : flat;
}

/**
 * A compact one-line argument summary shown inline on the tool-call row so the
 * call is legible without expanding (e.g. ``load_skill  my-skill``). Single-arg
 * calls surface their value; multi-arg calls surface a few scalar ``key: value``
 * pairs. Nested objects/arrays are omitted (they only appear in the super-admin
 * Details panel). Returns null when there's nothing worth showing inline.
 */
function inlineArgSummary(args: unknown): string | null {
    if (args === undefined || args === null) return null;
    if (typeof args === 'string') return args ? clampInline(args) : null;
    if (typeof args !== 'object') return clampInline(String(args));

    const entries = Object.entries(args as Record<string, unknown>);
    if (entries.length === 0) return null;

    const isScalar = (v: unknown) =>
        typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

    // Single-arg call: just the value (the common load_skill / read_file case).
    if (entries.length === 1) {
        const [, v] = entries[0];
        return isScalar(v) ? clampInline(String(v)) : null;
    }
    // Multi-arg: a few scalar "key: value" pairs; skip nested structures.
    const scalars = entries.filter(([, v]) => isScalar(v));
    if (scalars.length === 0) return null;
    return clampInline(scalars.slice(0, 3).map(([k, v]) => `${k}: ${v}`).join('  '));
}

/**
 * Format a tool-call arg/result for the (super-admin) details panel so embedded
 * newlines and tabs render as real line breaks instead of escaped "\n"/"\t".
 *
 * ``JSON.stringify(obj, null, 2)`` escapes newlines *inside* string values (e.g.
 * a ``code`` argument or a ``stdout`` blob), which makes multi-line code/output
 * unreadable on one line. This parses a JSON-string value, then prints the
 * structure with multi-line string values expanded as real, indented blocks.
 * Falls back to JSON.stringify / the raw string on anything unexpected.
 */
function formatToolValue(value: unknown): string {
    try {
        let v = value;
        if (typeof v === 'string') {
            const s = v.trim();
            const looksJson =
                (s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'));
            if (!looksJson) return value as string; // plain string — real newlines already
            try {
                v = JSON.parse(s);
            } catch {
                return value as string;
            }
        }
        if (v === null || typeof v !== 'object') return String(v);
        return renderContainer(v as Record<string, unknown> | unknown[], 0);
    } catch {
        return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    }
}

function renderContainer(v: Record<string, unknown> | unknown[], indent: number): string {
    const pad = '  '.repeat(indent);
    if (Array.isArray(v)) {
        if (v.length === 0) return '[]';
        return v.map((item) => `${pad}- ${renderToolValue(item, indent)}`).join('\n');
    }
    const entries = Object.entries(v);
    if (entries.length === 0) return '{}';
    return entries.map(([k, val]) => `${pad}${k}: ${renderToolValue(val, indent)}`).join('\n');
}

function renderToolValue(v: unknown, indent: number): string {
    if (v === null) return 'null';
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    if (typeof v === 'string') {
        if (!v.includes('\n')) return v;
        // Multi-line string: drop onto following lines, indented one level, so
        // the newlines/tabs it carries render literally in the <pre>.
        const childPad = '  '.repeat(indent + 1);
        return '\n' + v.split('\n').map((l) => childPad + l).join('\n');
    }
    if (typeof v === 'object') {
        return '\n' + renderContainer(v as Record<string, unknown> | unknown[], indent + 1);
    }
    return String(v);
}

interface ToolLineProps {
    call: ToolCall;
}

/**
 * A single tool call rendered as one compact row (ApprovalCard-resolved style),
 * with a right-aligned Details accordion for args + result.
 */
export function ToolLine({call}: ToolLineProps) {
    const isSuperAdmin = useAuthStore(s => !!s.userInfo?.permissions?.isSuperAdmin);
    const status = canonicalStatus(call?.status);
    const view = statusView(status);
    // The expandable args/result panel is a super-admin affordance; regular
    // users get the leaner inline summary only (no expansion).
    const canExpand = isSuperAdmin && hasDetails(call);
    const argSummary = inlineArgSummary(call.args);
    // Collapsed by default for everyone — details are opt-in (super-admins
    // click "Details" to expand; the inline summary carries the at-a-glance info).
    const [open, setOpen] = useState(false);

    return (
        <div className="rounded-md border border-gray-200 bg-white text-sm">
            <div className="flex items-center gap-2 px-2.5 py-1">
                <view.icon size={14} className={cn('shrink-0', view.cls, view.spin && 'animate-spin')} aria-hidden/>
                <code className="shrink-0 px-1 py-0.5 rounded bg-gray-100 text-[11px] font-mono text-gray-600">
                    {call.name || '(tool)'}
                </code>
                {argSummary && (
                    <span
                        className="min-w-0 max-w-[50%] truncate text-[11px] font-mono text-gray-500"
                        title={typeof call.args === 'string' ? call.args : JSON.stringify(call.args)}
                    >
                        {argSummary}
                    </span>
                )}
                <span className={cn('shrink-0 text-[11px]', view.cls)}>{view.label}</span>
                {canExpand && (
                    <button
                        type="button"
                        onClick={() => setOpen(o => !o)}
                        className="ml-auto shrink-0 inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        {open ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                        Details
                    </button>
                )}
            </div>
            {open && canExpand && (
                <div className="px-2.5 pb-2 space-y-1">
                    {call.args !== undefined && call.args !== null && (
                        <pre className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 p-1.5 rounded overflow-x-auto whitespace-pre-wrap break-words [tab-size:2]">
                            {formatToolValue(call.args)}
                        </pre>
                    )}
                    {status === 'running' && !call.result && (
                        <div className="text-[10px] text-gray-400 bg-gray-50 p-1.5 rounded border-l-2 border-blue-200 flex items-center gap-1.5">
                            <Loader2 size={10} className="animate-spin"/>
                            <span>Waiting for result…</span>
                        </div>
                    )}
                    {call.result !== undefined && call.result !== null && (
                        <pre className={cn(
                            'text-[10px] text-gray-600 bg-gray-50 p-1.5 rounded overflow-x-auto whitespace-pre-wrap break-words border-l-2 [tab-size:2]',
                            status === 'failed' ? 'border-red-200'
                                : status === 'cancelled' ? 'border-amber-200'
                                    : 'border-emerald-200',
                        )}>
                            {formatToolValue(call.result)}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}
