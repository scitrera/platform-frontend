import {useEffect, useRef, useState} from 'react';
import {Loader} from 'lucide-react';
import {useChatState} from '../../../hooks/useChatState';

/**
 * "Thinking" pill — visible while a chat_message Aether task is in
 * flight on the active thread (P5).
 *
 * Visibility is driven by ``activeTaskByThread`` (presence ⇒ pill shown).
 * The legacy ``latestProgress.name`` is used as a parenthetical detail
 * when present (e.g. "Thinking (Running Python)") and falls back to
 * plain "Thinking" between tools or before the first progress event.
 *
 * Elapsed time anchors on the task's ``startedAt`` (sourced from the
 * MESSAGE_TASK_STARTED event) so it's correct across tabs that connected
 * mid-stream and reconciled via GET_ACTIVE_TASKS.
 */
export const MessageProgress = () => {
    const {
        latestProgress,
        activeThreadId,
        getActiveChatTaskForThread,
    } = useChatState();
    const activeTask = getActiveChatTaskForThread
        ? getActiveChatTaskForThread(activeThreadId)
        : null;
    const inFlight = Boolean(activeTask?.taskId);

    const [elapsed, setElapsed] = useState('0.0');
    const startTimeRef = useRef<number | null>(null);

    useEffect(() => {
        if (!inFlight) {
            startTimeRef.current = null;
            setElapsed('0.0');
            return;
        }
        // Anchor elapsed on the task's recorded start time when available
        // (covers cross-tab reconcile where this tab opened mid-stream).
        // Fall back to "now" when startedAt is missing or absurd.
        const started = Number(activeTask?.startedAt) || Date.now();
        const validStart = (typeof started === 'number' && started > 0
                            && started <= Date.now()) ? started : Date.now();
        startTimeRef.current = validStart;
        setElapsed(((Date.now() - validStart) / 1000).toFixed(1));

        const interval = setInterval(() => {
            if (startTimeRef.current != null) {
                setElapsed(((Date.now() - startTimeRef.current) / 1000).toFixed(1));
            }
        }, 100);

        return () => clearInterval(interval);
    }, [inFlight, activeTask?.startedAt]);

    if (!inFlight) return null;

    const detailName = latestProgress?.name;
    const labelHead = detailName ? `Thinking (${detailName})` : 'Thinking';
    const detailLine = latestProgress?.message || latestProgress?.detail;

    return (
        <div className="w-full flex justify-center">
            <div className="flex items-start gap-3 text-sm text-gray-800 dark:text-gray-200 max-w-md">
                <Loader className="animate-spin mt-0.5 size-4 shrink-0 text-primary"/>
                <div className="flex flex-col">
                    <div className="font-medium leading-tight">
                        {labelHead}{' '}
                        <span className="ml-2 text-xs text-muted-foreground">{elapsed}s</span>
                    </div>
                    {detailLine && (
                        <div className="text-xs text-muted-foreground">{detailLine}</div>
                    )}
                </div>
            </div>
        </div>
    );
};
