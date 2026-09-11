import React, {useRef, useEffect, useCallback} from 'react';
import {Bell, Loader2} from 'lucide-react';
import TaskStatusCard from "../Widgets/TaskStatusCard.jsx";
import {useWebSocketApi, useWebSocketStatus} from "../../hooks/useWebSocketApi.js";
import {USER, WORKSPACE} from "../../constants/WebSocketConstants.jsx";
import RefreshButton from './RefreshButton.jsx';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useUIStore} from '@/stores/uiStore';

// How long (ms) a terminal (completed/failed) task lingers in the live feed
// before it's expired client-side. The snapshot RPC reconcile is the safety net.
const TERMINAL_EXPIRY_MS = 8_000;

// Low-frequency reconcile interval (ms). Live APP_PROGRESS events drive the
// feed; this only catches anything the push path missed (e.g. a dropped event
// or a task that started while disconnected).
const RECONCILE_INTERVAL_MS = 5 * 60_000;

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled']);

// Component to show background task progress.
const BackgroundTasks = () => {
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const bgTasks = useWorkspaceStore(s => s.backgroundTasks);
    const setBackgroundTasks = useWorkspaceStore(s => s.setBackgroundTasks);
    const addBackgroundTask = useWorkspaceStore(s => s.addBackgroundTask);
    const removeBackgroundTask = useWorkspaceStore(s => s.removeBackgroundTask);

    const progressPanelOpen = useUIStore(s => s.progressPanelOpen);
    const toggleProgressPanel = useUIStore(s => s.toggleProgressPanel);
    const closeAllDropdowns = useUIStore(s => s.closeAllDropdowns);

    const {sendRpcRequest, registerAppListener} = useWebSocketApi();
    const {isConnected} = useWebSocketStatus();
    const indicatorRef = useRef(null);

    const isActiveRef = useRef(true);
    const lastRequestTimeRef = useRef(0);
    const reconcileTimerRef = useRef(null);
    // id -> setTimeout handle for pending terminal-task expiry.
    const expiryTimersRef = useRef(new Map());

    // --- snapshot reconcile (RPC) ---
    const reconcile = useCallback(async () => {
        const now = Date.now();
        if (now - lastRequestTimeRef.current < 500) {
            return; // throttle bursts
        }
        lastRequestTimeRef.current = now;

        try {
            const response = await sendRpcRequest(WORKSPACE.GET_BACKGROUND_TASKS, {
                workspace: currentWorkspaceId,
            });
            // Server already excludes BACKGROUND-class tasks, so every snapshot
            // entry is showable — no client-side class filter needed here.
            if (isActiveRef.current) setBackgroundTasks(Object.values(response || {}));
        } catch {
            if (isActiveRef.current) setBackgroundTasks([]);
        }
    }, [sendRpcRequest, currentWorkspaceId, setBackgroundTasks]);

    // Initial load + reconcile on workspace switch / reconnect, plus a
    // low-frequency safety-net interval (NOT the old 30s poll).
    useEffect(() => {
        isActiveRef.current = true;
        if (!isConnected) return undefined;

        reconcile(); // noinspection JSIgnoredPromiseFromCall

        clearInterval(reconcileTimerRef.current);
        reconcileTimerRef.current = setInterval(() => {
            reconcile(); // noinspection JSIgnoredPromiseFromCall
        }, RECONCILE_INTERVAL_MS);

        return () => {
            isActiveRef.current = false;
            clearInterval(reconcileTimerRef.current);
        };
    }, [reconcile, isConnected, currentWorkspaceId]);

    // --- live APP_PROGRESS subscription ---
    useEffect(() => {
        if (!isConnected || !registerAppListener) return undefined;

        const expiryTimers = expiryTimersRef.current;

        const unsubscribe = registerAppListener(USER.APP_PROGRESS, (payload) => {
            if (!payload || !payload.id) return;

            // Connector/system (BACKGROUND-class) ingest is broadcast over the
            // same workspace channel but must stay hidden in the panel.
            // 'batch' (user-initiated) and legacy null (app-dashboard) are kept.
            if (payload.task_class === 'background') return;

            addBackgroundTask(payload);

            // Terminal task: keep it visible briefly, then expire from the feed.
            if (TERMINAL_STATUSES.has(payload.status)) {
                const existing = expiryTimers.get(payload.id);
                if (existing) clearTimeout(existing);
                const handle = setTimeout(() => {
                    removeBackgroundTask(payload.id);
                    expiryTimers.delete(payload.id);
                }, TERMINAL_EXPIRY_MS);
                expiryTimers.set(payload.id, handle);
            } else {
                // A task that went back to running cancels any pending expiry.
                const existing = expiryTimers.get(payload.id);
                if (existing) {
                    clearTimeout(existing);
                    expiryTimers.delete(payload.id);
                }
            }
        }, 'BackgroundTasks');

        return () => {
            unsubscribe?.();
            expiryTimers.forEach((handle) => clearTimeout(handle));
            expiryTimers.clear();
        };
    }, [isConnected, registerAppListener, addBackgroundTask, removeBackgroundTask]);

    const triggerManualRefresh = useCallback(async () => {
        await reconcile();
    }, [reconcile]);

    const activeTasksCount = bgTasks.filter(task => task.status === 'running' || task.status === 'pending').length;
    const failedTasksCount = bgTasks.filter(task => task.status === 'failed').length;

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (indicatorRef.current && !indicatorRef.current.contains(event.target) && progressPanelOpen) {
                closeAllDropdowns();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [progressPanelOpen, closeAllDropdowns]);

    return (
        <div className="relative" ref={indicatorRef}>
            <button
                onClick={() => toggleProgressPanel()}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                title={activeTasksCount > 0 ? `${activeTasksCount} active task(s)` : "Background Tasks"}
                aria-expanded={progressPanelOpen}
                aria-controls="progress-panel"
            >
                {activeTasksCount > 0 ? (
                    <Loader2 size={22} className="animate-spin text-blue-500"/>
                ) : (
                    <Bell size={22}/>
                )}
                {bgTasks.length > 0 && (failedTasksCount === 0 || activeTasksCount > 0) && (
                    <span
                        className="absolute top-0 right-0 block h-2.5 w-2.5 transform -translate-y-0.5 translate-x-0.5 rounded-full bg-green-500 ring-2 ring-white"/>
                )}
                {bgTasks.length > 0 && activeTasksCount === 0 && failedTasksCount > 0 && (
                    <span
                        className="absolute top-0 right-0 block h-2.5 w-2.5 transform -translate-y-0.5 translate-x-0.5 rounded-full bg-red-500 ring-2 ring-white"/>
                )}
            </button>
            {progressPanelOpen && (
                <div
                    id="progress-panel"
                    className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-xl z-20 border border-gray-200"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="progress-panel-title"
                >
                    <div className="flex items-center justify-between p-3 border-b">
                        <h3 id="progress-panel-title" className="font-semibold text-sm text-gray-700">
                            Background Operations
                        </h3>
                        <RefreshButton
                            onRefresh={triggerManualRefresh}
                            title="Refresh tasks now"
                        />
                    </div>
                    {bgTasks.length === 0 ? (
                        <p className="p-4 text-sm text-gray-500">No active or recent tasks.</p>
                    ) : (
                        <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                            {bgTasks.map(task => (
                                <li key={task.id} className="p-3 hover:bg-gray-50">
                                    <TaskStatusCard task={task}/>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

export default BackgroundTasks;
