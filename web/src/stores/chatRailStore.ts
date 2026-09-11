/**
 * Chat rail state machine store.
 *
 * Drives the right-side chat rail: collapsed (icon launcher), sidebar
 * (drag-resizable), or fullscreen (overlay). Width and the drawer
 * toggles for threads/artifacts are persisted to localStorage so the
 * user's chat-layout preference survives reloads.
 */

import {create} from 'zustand';
import {UI_CONSTANTS} from '@/constants/AppConstants';

export type ChatRailState = 'collapsed' | 'sidebar' | 'fullscreen';

interface ChatRailStore {
    state: ChatRailState;
    width: number;
    threadsOpen: boolean;
    artifactsOpen: boolean;
    todosOpen: boolean;

    setState(s: ChatRailState): void;
    setWidth(px: number): void;
    toggleThreads(): void;
    toggleArtifacts(): void;
    toggleTodos(): void;
    setThreadsOpen(open: boolean): void;
    setArtifactsOpen(open: boolean): void;
    setTodosOpen(open: boolean): void;
    /** collapsed → sidebar (or no-op if already non-collapsed). */
    expand(): void;
    /** fullscreen → sidebar; sidebar → collapsed; collapsed → no-op. */
    minimize(): void;
    /** any → fullscreen. */
    maximize(): void;
}

const KEY_STATE = UI_CONSTANTS.LOCAL_STORAGE_CHAT_RAIL_STATE;
const KEY_WIDTH = UI_CONSTANTS.LOCAL_STORAGE_CHAT_RAIL_WIDTH;
const KEY_THREADS = UI_CONSTANTS.LOCAL_STORAGE_CHAT_RAIL_THREADS_OPEN;
const KEY_ARTIFACTS = UI_CONSTANTS.LOCAL_STORAGE_CHAT_RAIL_ARTIFACTS_OPEN;
const KEY_TODOS = UI_CONSTANTS.LOCAL_STORAGE_CHAT_RAIL_TODOS_OPEN;

const DEFAULT_WIDTH = UI_CONSTANTS.CHAT_RAIL_DEFAULT_WIDTH;
const MIN_WIDTH = UI_CONSTANTS.CHAT_RAIL_MIN_WIDTH;

function maxWidth(): number {
    if (typeof window === 'undefined') return 800;
    return Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.5));
}

function clampWidth(px: number): number {
    return Math.min(maxWidth(), Math.max(MIN_WIDTH, px));
}

function readPersistedState(): ChatRailState {
    try {
        const raw = localStorage.getItem(KEY_STATE);
        if (raw === 'collapsed' || raw === 'sidebar' || raw === 'fullscreen') return raw;
    } catch {
        /* ignore */
    }
    return 'sidebar';
}

function readPersistedWidth(): number {
    try {
        const raw = localStorage.getItem(KEY_WIDTH);
        const parsed = raw != null ? parseInt(raw, 10) : NaN;
        if (!isNaN(parsed)) return clampWidth(parsed);
    } catch {
        /* ignore */
    }
    return DEFAULT_WIDTH;
}

function readPersistedBool(key: string, fallback: boolean): boolean {
    try {
        const raw = localStorage.getItem(key);
        if (raw === 'true') return true;
        if (raw === 'false') return false;
    } catch {
        /* ignore */
    }
    return fallback;
}

function persist(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* ignore */
    }
}

export const useChatRailStore = create<ChatRailStore>((set, get) => ({
    state: readPersistedState(),
    width: readPersistedWidth(),
    threadsOpen: readPersistedBool(KEY_THREADS, true),
    // Artifacts + tasks share one slot; a stale persisted "both open" (from
    // before mutual exclusion) resolves in favor of tasks so the slot is never
    // double-booked on load.
    artifactsOpen: readPersistedBool(KEY_ARTIFACTS, false) && !readPersistedBool(KEY_TODOS, false),
    todosOpen: readPersistedBool(KEY_TODOS, false),

    setState: (s) => {
        persist(KEY_STATE, s);
        set({state: s});
    },

    setWidth: (px) => {
        const clamped = clampWidth(px);
        persist(KEY_WIDTH, String(clamped));
        set({width: clamped});
    },

    toggleThreads: () => {
        const next = !get().threadsOpen;
        persist(KEY_THREADS, String(next));
        set({threadsOpen: next});
    },

    // Artifacts and tasks share one right-hand slot: opening either displaces
    // the other so they never stack. The two are still persisted independently
    // (a user who left tasks open reloads with tasks, not artifacts).
    toggleArtifacts: () => {
        const next = !get().artifactsOpen;
        persist(KEY_ARTIFACTS, String(next));
        if (next) persist(KEY_TODOS, 'false');
        set(next ? {artifactsOpen: true, todosOpen: false} : {artifactsOpen: false});
    },

    setThreadsOpen: (open) => {
        persist(KEY_THREADS, String(open));
        set({threadsOpen: open});
    },

    setArtifactsOpen: (open) => {
        persist(KEY_ARTIFACTS, String(open));
        if (open) persist(KEY_TODOS, 'false');
        set(open ? {artifactsOpen: true, todosOpen: false} : {artifactsOpen: false});
    },

    toggleTodos: () => {
        const next = !get().todosOpen;
        persist(KEY_TODOS, String(next));
        if (next) persist(KEY_ARTIFACTS, 'false');
        set(next ? {todosOpen: true, artifactsOpen: false} : {todosOpen: false});
    },

    setTodosOpen: (open) => {
        persist(KEY_TODOS, String(open));
        if (open) persist(KEY_ARTIFACTS, 'false');
        set(open ? {todosOpen: true, artifactsOpen: false} : {todosOpen: false});
    },

    expand: () => {
        if (get().state === 'collapsed') {
            persist(KEY_STATE, 'sidebar');
            set({state: 'sidebar'});
        }
    },

    minimize: () => {
        const cur = get().state;
        if (cur === 'fullscreen') {
            persist(KEY_STATE, 'sidebar');
            set({state: 'sidebar'});
        } else if (cur === 'sidebar') {
            persist(KEY_STATE, 'collapsed');
            set({state: 'collapsed'});
        }
    },

    maximize: () => {
        persist(KEY_STATE, 'fullscreen');
        set({state: 'fullscreen'});
    },
}));
