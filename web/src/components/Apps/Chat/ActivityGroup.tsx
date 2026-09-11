import React, {useState} from 'react';
import {Activity as ActivityIcon, ChevronDown, ChevronRight, Loader2} from 'lucide-react';
import type {ApprovalRequestPart} from '@scitrera/messaging-spec';
import type {ToolCall} from '@/types/chat';
import {ToolLine, canonicalStatus} from './ToolCallDisplay';
import {ReasoningDisplay} from './ReasoningDisplay';
import {ApprovalCard} from './ApprovalCard';

/**
 * Grouped "activity" presentation for the chat rail.
 *
 * An ACTIVITY is any inline row that represents the agent working rather than
 * answering: a tool call, a model-reasoning trace, or a resolved approval
 * decision. They're visually one family (compact bordered rows) and, to the
 * user, one kind of thing — so they collapse under one banner rather than each
 * flavour getting its own run.
 *
 * A run of consecutive activities renders as:
 *   - while the run is still the trailing content of a streaming message
 *     (``trailing``), the earlier N-1 activities collapse into one accordion
 *     banner and only the last (live) one is fully surfaced;
 *   - once the turn moves on to other content or finalizes (``trailing`` false),
 *     the whole run collapses to a single "N activities" accordion banner that
 *     expands to the full history.
 *
 * Anything ACTION-REQUIRED is never buried: a *pending* approval request is
 * kept out of the group entirely by the composition site
 * (``MessageItem.renderSpecContent``), and as a backstop a banner that somehow
 * contains one opens by default.
 */

export type Activity =
    | {kind: 'tool'; key: string; call: ToolCall}
    | {kind: 'reasoning'; key: string; text: string}
    | {kind: 'approval'; key: string; part: ApprovalRequestPart};

/** The activity is still running / streaming (drives the banner's spinner). */
function isInFlight(a: Activity): boolean {
    if (a.kind === 'tool') return canonicalStatus(a.call.status) === 'running';
    if (a.kind === 'approval') return a.part.status === 'pending';
    return false;
}

/** The activity is blocking on the user (must never hide behind a banner). */
function needsAction(a: Activity): boolean {
    return a.kind === 'approval' && a.part.status === 'pending';
}

/**
 * One activity as a single row.
 *
 * Each flavour's component carries its own vertical margin for standalone use;
 * inside a group the wrapper owns spacing, so neutralize it here (the child
 * selector out-specifies the component's own ``my-*``).
 */
function ActivityRow({activity}: {activity: Activity}) {
    const inner = (() => {
        switch (activity.kind) {
            case 'tool':
                return <ToolLine call={activity.call}/>;
            case 'reasoning':
                return <ReasoningDisplay content={activity.text}/>;
            case 'approval':
                return <ApprovalCard part={activity.part}/>;
        }
    })();
    return <div className="[&>*]:my-0">{inner}</div>;
}

interface ActivityBannerProps {
    activities: Activity[];
    label: string;
}

/**
 * A single-line accordion summarizing a run of activities; expands to the full
 * list of activity rows.
 */
function ActivityBanner({activities, label}: ActivityBannerProps) {
    // Backstop only — the composition site keeps pending approvals out of a
    // group, so this normally starts collapsed.
    const [open, setOpen] = useState(() => activities.some(needsAction));
    const hasInFlight = activities.some(isInFlight);

    return (
        <div className="rounded-md border border-gray-200 bg-white text-sm">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-2 px-2.5 py-1 text-left text-gray-500 hover:text-gray-700 transition-colors"
            >
                {open ? <ChevronDown size={12} className="shrink-0"/> : <ChevronRight size={12} className="shrink-0"/>}
                <ActivityIcon size={14} className="shrink-0 text-gray-400"/>
                <span className="min-w-0 truncate">{label}</span>
                {hasInFlight && <Loader2 size={11} className="ml-auto shrink-0 animate-spin text-blue-500"/>}
            </button>
            {open && (
                <div className="px-2 pb-2 pt-0.5 space-y-1">
                    {activities.map(a => (
                        <ActivityRow key={a.key} activity={a}/>
                    ))}
                </div>
            )}
        </div>
    );
}

const plural = (n: number) => (n === 1 ? 'activity' : 'activities');

interface ActivityGroupProps {
    activities: Activity[];
    /**
     * The group is the trailing content of an in-flight message: surface the
     * last activity live and collapse the earlier ones behind a banner. When
     * false (the turn moved on / finalized), the whole run is one collapsed
     * banner.
     */
    trailing?: boolean;
}

/** Renders a run of consecutive activities (see module doc). */
export function ActivityGroup({activities, trailing = false}: ActivityGroupProps) {
    if (!activities || activities.length === 0) return null;

    // A lone activity is never worth a banner — it IS the summary.
    if (activities.length === 1) {
        return <div className="my-2"><ActivityRow activity={activities[0]}/></div>;
    }

    if (trailing) {
        // Earlier activities collapse behind a banner; the last is surfaced live.
        const earlier = activities.slice(0, -1);
        const last = activities[activities.length - 1];
        return (
            <div className="my-2 space-y-1">
                <ActivityBanner
                    activities={earlier}
                    label={`${earlier.length} earlier ${plural(earlier.length)}`}
                />
                <ActivityRow activity={last}/>
            </div>
        );
    }

    return (
        <div className="my-2">
            <ActivityBanner activities={activities} label={`${activities.length} ${plural(activities.length)}`}/>
        </div>
    );
}
