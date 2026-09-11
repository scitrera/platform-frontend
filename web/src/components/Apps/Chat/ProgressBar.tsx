import React, {memo} from 'react';
import {Check, CircleAlert, Loader2} from 'lucide-react';
import {cn} from '@/lib/utils';

/**
 * Live tqdm-style progress bar rendered from a spec ``dynamic`` content part of
 * kind ``tool_call_progress`` (streamed by the in-sandbox scitrera tqdm through
 * execd + the sahara harness). Each bar is one stable content part that streams
 * ``part_appended`` once then ``part_updated`` in place, so this component just
 * re-renders as its payload mutates.
 *
 * The payload type is declared locally (not imported from ``@scitrera/messaging-spec``)
 * so the renderer works regardless of the installed spec package version.
 */
export interface ProgressPayload {
    bar_id?: string;
    desc?: string;
    n?: number;
    total?: number;
    elapsed_s?: number;
    rate?: number;
    eta_s?: number;
    unit?: string;
    status?: 'running' | 'done' | 'error';
}

/** Compact H:MM:SS / M:SS duration (tqdm-style). */
function fmtDuration(seconds?: number): string {
    if (seconds == null || !isFinite(seconds) || seconds < 0) return '--:--';
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function fmtRate(rate?: number, unit = 'it'): string {
    if (!rate || !isFinite(rate) || rate <= 0) return '';
    // tqdm flips to s/it when slower than 1/s; keep it readable.
    return rate >= 1 ? `${rate.toFixed(rate >= 10 ? 0 : 2)} ${unit}/s` : `${(1 / rate).toFixed(2)} s/${unit}`;
}

export const ProgressBar = memo(({payload}: {payload: ProgressPayload}) => {
    const status = payload.status || 'running';
    const n = payload.n ?? 0;
    const total = payload.total && payload.total > 0 ? payload.total : 0;
    const unit = payload.unit || 'it';
    const known = total > 0;
    const frac = known ? Math.max(0, Math.min(1, n / total)) : status === 'done' ? 1 : 0;
    const pct = Math.round(frac * 100);

    const barColor =
        status === 'error'
            ? 'bg-red-500'
            : status === 'done'
              ? 'bg-emerald-500'
              : 'bg-blue-500';

    const stats: string[] = [];
    stats.push(known ? `${fmtInt(n)}/${fmtInt(total)}` : `${fmtInt(n)} ${unit}`);
    if (known) stats.push(`${pct}%`);
    stats.push(fmtDuration(payload.elapsed_s));
    if (status === 'running' && known && payload.eta_s != null) stats.push(`ETA ${fmtDuration(payload.eta_s)}`);
    const rate = fmtRate(payload.rate, unit);
    if (rate) stats.push(rate);

    return (
        <div className="my-1.5 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-800/50">
            <div className="mb-1 flex items-center gap-1.5">
                {status === 'running' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500"/>}
                {status === 'done' && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500"/>}
                {status === 'error' && <CircleAlert className="h-3.5 w-3.5 shrink-0 text-red-500"/>}
                <span className="truncate font-medium text-gray-700 dark:text-gray-200">
                    {payload.desc || 'Working'}
                </span>
                <span className="ml-auto shrink-0 font-mono text-gray-500 dark:text-gray-400">
                    {stats.join(' · ')}
                </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                    className={cn(
                        'h-full rounded-full transition-all duration-200 ease-out',
                        barColor,
                        // Unknown-length running bar: pulse instead of a fixed width.
                        !known && status === 'running' && 'w-1/3 animate-pulse',
                    )}
                    style={known || status !== 'running' ? {width: `${pct}%`} : undefined}
                />
            </div>
        </div>
    );
});
ProgressBar.displayName = 'ProgressBar';

function fmtInt(v: number): string {
    return Number.isInteger(v) ? String(v) : String(Math.round(v));
}
