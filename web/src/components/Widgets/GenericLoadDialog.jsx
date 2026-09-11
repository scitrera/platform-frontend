import React, {useEffect, useMemo, useRef, useState} from 'react';
import {DEBUG_MODE} from "../../constants/AppConstants";

// GenericLoadDialog: workspace-aware browser dialog for selecting an item to load
// Reusable for DocMatrix, Datasets, etc.
// Props:
// - isOpen: boolean
// - onClose: fn()
// - onSelect: fn(item)
// - title: string
// - listWorkspaces: async () => [{id,name}]
// - listItemsInWorkspace: async (workspaceId) => [{id,name, ...}]
// - initialWorkspaceId: string | null
// - renderItem: optional fn(item, {isActive}) => ReactNode
// - emptyText: optional string for empty item list
// - searchEnabled: boolean (default true)
export default function GenericLoadDialog({
                                              isOpen,
                                              onClose,
                                              onSelect,
                                              title = 'Open',
                                              listWorkspaces,
                                              listItemsInWorkspace,
                                              initialWorkspaceId = null,
                                              renderItem = null,
                                              emptyText = 'No items found',
                                              searchEnabled = true,
                                          }) {
    const [workspaces, setWorkspaces] = useState([]);
    const [selectedWs, setSelectedWs] = useState(initialWorkspaceId);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const wsListRef = useRef(null);
    const wsItemRefs = useRef({});

    // Helper: sort by updated timestamp (newest first). Accepts several common keys.
    const sortByUpdated = (list) => {
        const getTs = (it) => {
            const v = it?.updatedAt ?? it?.updated ?? it?.lastUpdated ?? null;
            if (v == null) return 0;
            if (typeof v === 'number') return v;
            const d = new Date(v);
            const t = d.getTime();
            return Number.isFinite(t) ? t : 0;
        };
        return Array.isArray(list) ? [...list].sort((a, b) => getTs(b) - getTs(a)) : [];
    };

    useEffect(() => {
        if (!isOpen) return;
        let mounted = true;

        const loadData = async () => {
            setLoading(true);
            try {
                // 1. Load workspaces if not already loaded or if it's the first open
                let currentWorkspaces = workspaces;
                if (workspaces.length === 0) {
                    const ws = await (listWorkspaces?.() ?? []);
                    if (!mounted) return;
                    setWorkspaces(ws || []);
                    currentWorkspaces = ws || [];
                }

                // 2. Determine which workspace to load items for
                // If selectedWs is already set, use it. Otherwise, determine initial.
                let targetWsId = selectedWs;
                if (!targetWsId && currentWorkspaces.length > 0) {
                    targetWsId = initialWorkspaceId || currentWorkspaces[0]?.id || null;
                    if (targetWsId) {
                        setSelectedWs(targetWsId);
                    }
                }

                // 3. Load items for the target workspace
                if (targetWsId) {
                    const list = await (listItemsInWorkspace?.(targetWsId) ?? []);
                    if (!mounted) return;
                    setItems(sortByUpdated(list));
                } else {
                    if (mounted) setItems([]);
                }
            } catch (err) {
                DEBUG_MODE && console.error("Error loading dialog data:", err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        loadData();
        return () => {
            mounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, selectedWs, initialWorkspaceId]);

    useEffect(() => {
        // Scroll selected workspace into view (align with DocMatrix behavior)
        if (!isOpen || !selectedWs) return;
        const el = wsItemRefs.current[selectedWs];
        const container = wsListRef.current;
        if (!el) return;
        try {
            // Preferred smooth scroll to the element
            el.scrollIntoView({block: 'start', behavior: 'smooth'});
        } catch {
            // Fallbacks
            try {
                el.scrollIntoView();
            } catch {
                if (container) {
                    const top = el.offsetTop - container.clientHeight / 2;
                    container.scrollTo({top, behavior: 'smooth'});
                }
            }
        }
    }, [isOpen, selectedWs]);

    const filteredItems = useMemo(() => {
        if (!query) return items;
        const q = query.toLowerCase();
        return (items || []).filter(it => (it.name || '').toLowerCase().includes(q));
    }, [items, query]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div
                className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-[900px] max-w-[95vw] h-[600px] max-h-[90vh] overflow-hidden flex flex-col">
                <div
                    className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white/80 backdrop-blur">
                    <div className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                <div className="flex-1 flex min-h-0">
                    {/* Workspaces */}
                    <div
                        className="w-64 border-r border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/30">
                        <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase">Workspaces</div>
                        <div ref={wsListRef} className="h-full overflow-auto">
                            {workspaces?.map(ws => (
                                <div
                                    key={ws.id}
                                    ref={el => wsItemRefs.current[ws.id] = el}
                                    onClick={() => setSelectedWs(ws.id)}
                                    className={`px-4 py-2 text-sm cursor-pointer border-l-4 transition-colors ${selectedWs === ws.id ? 'bg-blue-50 border-blue-600 text-blue-800' : 'border-transparent hover:bg-slate-50 text-slate-600 hover:text-slate-900'}`}
                                    title={ws.name}
                                >
                                    <div className="truncate">{ws.name}</div>
                                </div>
                            ))}
                            {(!workspaces || workspaces.length === 0) && (
                                <div className="px-4 py-6 text-sm text-slate-400">No workspaces available</div>
                            )}
                        </div>
                    </div>
                    {/* Items */}
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-white">
                            {searchEnabled && (
                                <input
                                    type="text"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Search by name..."
                                    className="w-full px-3 py-2 text-sm border rounded bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            )}
                        </div>
                        <div className="flex-1 overflow-auto">
                            {loading ? (
                                <div className="p-6 text-sm text-slate-500">Loading…</div>
                            ) : filteredItems?.length ? (
                                <ul className="divide-y divide-slate-100">
                                    {filteredItems.map(item => (
                                        <li
                                            key={item.id}
                                            className="px-4 py-3 hover:bg-slate-50 cursor-pointer"
                                            onClick={() => onSelect?.(item, selectedWs)}
                                            title={item.name}
                                        >
                                            {renderItem ? renderItem(item, {isActive: false}) : (
                                                <div className="flex items-center justify-between">
                                                    <div
                                                        className="truncate font-medium text-slate-700">{item.name}</div>
                                                    {item.updatedAt && (
                                                        <div
                                                            className="text-xs text-slate-400 ml-3 whitespace-nowrap">{new Date(item.updatedAt).toLocaleString()}</div>
                                                    )}
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="p-6 text-center text-sm text-slate-400">{emptyText}</div>
                            )}
                        </div>
                    </div>
                </div>
                <div
                    className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/60 flex justify-end">
                    <button onClick={onClose}
                            className="px-3 py-2 text-sm rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">Close
                    </button>
                </div>
            </div>
        </div>
    );
}
