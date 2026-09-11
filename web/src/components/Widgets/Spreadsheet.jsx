import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    Download,
    ChevronDown,
    ChevronUp,
    RefreshCw,
    Database,
    AlertCircle
} from 'lucide-react';

/**
 * Spreadsheet component with virtualized, lazy-loaded rows.
 * Props allow external data sources and readonly mode for a viewer-only experience.
 *
 * @param {function=} onFetchMeta - async () => { columns: ColumnDef[], totalRows: number }
 * @param {function=} onFetchRows - async ({ offset, limit, sort }) => Array<Row>
 * @param {string=} title - Title displayed in the toolbar. Default 'Large Data Grid'.
 * @param {boolean=} readOnly - When true, disables all editing. Default false.
 * @param {string|function=} rowKey - Field name (default 'id') or function(row)=>any to derive unique row key.
 * @param {{key:string,direction:'asc'|'desc'}=} initialSort - Initial sort applied to providers.
 * @param {boolean=} fullHeight - When true, uses viewport height (h-screen). Default false; adapts to parent height.
 * @param {string|number=} maxHeight - When not fullHeight, caps the component height to ensure the inner body scrolls.
 *                                      Defaults to '80vh'. If number is provided, it's treated as pixels.
 * @param {boolean=} showToolbar - When false, hides the top toolbar (title/actions) for embed/table-only views. Default true.
 * @param {boolean=} showFooter - When false, hides the bottom footer info row for embed/table-only views. Default true.
 *
 * ColumnDef shape (demo-friendly, not enforced):
 * {
 *   key: string,
 *   label: string,
 *   width?: number,
 *   align?: 'left'|'center'|'right',
 *   type?: 'text'|'number'|'money'|'computed'|string,
 *   cellClassName?: string | (row) => string, // extra classes for the cell container
 *   renderCell?: (row, value) => React.ReactNode, // custom cell renderer
 *   readOnly?: boolean, // when true, cells in this column are not editable; default false (computed implies true)
 *   sortable?: boolean, // enable/disable sorting for this column; default true
 *   renderEditor?: (ctx: { row, value, setValue: (v:any)=>void, onCommit:()=>void, onCancel:()=>void, col }) => React.ReactNode, // custom editor
 *   editor?: React.ComponentType<EditorProps>, // alternative: component to render as editor
 *   onHeaderDoubleClick?: (col) => void, // custom action on header double click (default none)
 * }
 */
const Spreadsheet = ({
    onFetchMeta,
    onFetchRows,
    onSaveCell,      // async (rowKey, columnKey, value) => void
    onExportCsv,     // async () => void
    title = 'Large Data Grid',
    readOnly = false,
    rowKey = 'id',
    initialSort = null,
    fullHeight = false,
    maxHeight = '100%',
    showToolbar = true,
    showFooter = true,
}) => {
    // --- Configuration ---
    const ROW_HEIGHT = 40; // Fixed row height for high perf

    // --- State ---
    const [rows, setRows] = useState([]); // sparse array filled as we fetch
    const [totalCount, setTotalCount] = useState(0);
    const [columns, setColumns] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [, setLoadTime] = useState(0);
    const [, setError] = useState(null);

    // Sorting state
    const [sortConfig, setSortConfig] = useState(initialSort || { key: null, direction: 'asc' });

    // Editing state
    const [selectedCell, setSelectedCell] = useState(null); // { rowId, colKey }
    const [editingCell, setEditingCell] = useState(null); // { rowId, colKey }
    const [editValue, setEditValue] = useState('');

    // Refs
    const parentRef = useRef(null);
    const inputRef = useRef(null);
    const isDraggingCol = useRef(false);
    const dragInfoRef = useRef(null); // { key, startX, startWidth, moved? }
    const autoFitDoneRef = useRef(false);
    const wasResizingColRef = useRef(false); // suppress header click after a resize drag

    // Note: This component is pure. It does NOT include demo data or fallbacks.
    // Provide data via props: onFetchMeta and onFetchRows. See SpreadsheetDemo.jsx for an example.

    const fetchMeta = useCallback(async (sort = sortConfig) => {
        setError(null);
        const start = performance.now();
        if (!onFetchMeta) {
            setColumns([]);
            setTotalCount(0);
            setError('No onFetchMeta provider supplied');
            setLoadTime(performance.now() - start);
            return;
        }
        const meta = await onFetchMeta(sort ? { sort } : {});
        // Merge incoming meta columns with existing columns to preserve user-sized widths
        setColumns(prevCols => {
            const prevByKey = new Map((prevCols || []).map(c => [c.key, c]));
            const next = (meta.columns || []).map(c => {
                const prev = prevByKey.get(c.key);
                if (!prev) return c;
                // If user previously resized this column, keep that width and flag
                if (prev.userSized) {
                    return { ...c, width: prev.width, userSized: true };
                }
                // Otherwise, prefer new meta but carry width if meta omitted it
                return { ...c, width: c.width ?? prev.width, userSized: prev.userSized || false };
            });
            return next;
        });
        setTotalCount(meta.totalRows || 0);
        autoFitDoneRef.current = false; // reset auto-fit on new meta
        setRows(prev => {
            // reset or resize array to totalCount
            const arr = Array.from({ length: meta.totalRows || 0 }, (_, i) => prev[i] ?? null);
            return arr;
        });
        setLoadTime(performance.now() - start);
    }, [onFetchMeta, sortConfig]);

    // Track in-flight fetch ranges to prevent duplicate calls
    const inFlight = useRef(new Set()); // keys like "start:end:sortKey:sortDir"

    // Fetch a contiguous range if any items missing
    const fetchRangeIfNeeded = useCallback(async (startIndex, endIndex) => {
        if (totalCount === 0) return;
        const s = Math.max(0, startIndex);
        const e = Math.min(totalCount - 1, endIndex);
        if (e < s) return;

        // check if any missing
        let anyMissing = false;
        for (let i = s; i <= e; i++) {
            if (!rows[i]) { anyMissing = true; break; }
        }
        if (!anyMissing) return;

        const key = `${s}:${e}:${sortConfig?.key || ''}:${sortConfig?.direction || ''}`;
        if (inFlight.current.has(key)) return;
        inFlight.current.add(key);
        try {
            if (!onFetchRows) {
                setError('No onFetchRows provider supplied');
                return;
            }
            const result = await onFetchRows({ offset: s, limit: e - s + 1, sort: sortConfig?.key ? sortConfig : undefined });
            setRows(prev => {
                const next = prev.slice();
                for (let i = 0; i < result.length; i++) {
                    next[s + i] = result[i];
                }
                return next;
            });
        } catch (err) {
            setError(err?.message || 'Failed to fetch rows');
        } finally {
            inFlight.current.delete(key);
        }
    }, [rows, totalCount, onFetchRows, sortConfig]);

    // Initial meta load
    useEffect(() => {
        setIsLoading(true);
        fetchMeta().finally(() => setIsLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- Sorting Logic ---
    const handleSort = async (key) => {
        // Cycle: off -> asc -> desc -> off
        let nextSort = null;
        if (sortConfig?.key !== key) {
            nextSort = { key, direction: 'asc' };
        } else if (sortConfig?.direction === 'asc') {
            nextSort = { key, direction: 'desc' };
        } else {
            // was desc -> turn sort off
            nextSort = null;
        }

        setSortConfig(nextSort || { key: null, direction: 'asc' });
        // reset cache for new sort (or clearing sort)
        setRows(Array.from({ length: totalCount }, () => null));
        inFlight.current.clear();
        setIsLoading(true);
        try {
            await fetchMeta(nextSort);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Virtualization ---
    const virtualizer = useVirtualizer({
        count: totalCount || 0,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 100, // Render 100 extra rows for smooth scrolling
    });

    // --- Interaction Handlers ---

    const handleCellClick = (rowId, colKey) => {
        setSelectedCell({ rowId, colKey });
        setEditingCell(null);
    };

    const handleDoubleClick = (rowId, colKey, value) => {
        // Respect global and per-column readOnly
        if (readOnly) return;
        const col = columns.find(c => c.key === colKey);
        if (!col) return;
        const colReadOnly = col.readOnly || (col.type === 'computed' && col.readOnly !== false);
        if (colReadOnly) return;

        setSelectedCell({ rowId, colKey });
        setEditingCell({ rowId, colKey });
        setEditValue(value);
    };

    const handleKeyDown = (e, rowId, colKey) => {
        // If editing, handle Enter/Esc
        if (editingCell) {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') setEditingCell(null);
            return;
        }

        // Grid Navigation
        // We need to find the CURRENT index
        const currentRowIndex = rows.findIndex(r => r && (typeof rowKey === 'function' ? rowKey(r) : r[rowKey]) === rowId);
        const currentColIndex = columns.findIndex(c => c.key === colKey);

        if (currentRowIndex === -1 || currentColIndex === -1) return;

        let nextRowIdx = currentRowIndex;
        let nextColIdx = currentColIndex;

        if (e.key === 'ArrowUp') nextRowIdx = Math.max(0, currentRowIndex - 1);
        if (e.key === 'ArrowDown') nextRowIdx = Math.min(totalCount - 1, currentRowIndex + 1);
        if (e.key === 'ArrowLeft') nextColIdx = Math.max(0, currentColIndex - 1);
        if (e.key === 'ArrowRight') nextColIdx = Math.min(columns.length - 1, currentColIndex + 1);

        if (e.key === 'Enter') {
            const val = rows[currentRowIndex]?.[colKey];
            handleDoubleClick(rowId, colKey, val);
            return;
        }

        if (nextRowIdx !== currentRowIndex || nextColIdx !== currentColIndex) {
            e.preventDefault();
            const nextRow = rows[nextRowIdx];
            const nextCol = columns[nextColIdx];

            if (nextRow) setSelectedCell({ rowId: typeof rowKey === 'function' ? rowKey(nextRow) : nextRow[rowKey], colKey: nextCol.key });

            // Auto-scroll logic if using a real library,
            // simple scrollIntoView for demo:
            const rid = nextRow ? (typeof rowKey === 'function' ? rowKey(nextRow) : nextRow[rowKey]) : `skeleton-${nextRowIdx}`;
            const el = document.getElementById(`cell-${rid}-${nextCol.key}`);
            if (el) {
                el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
        }
    };

    const saveEdit = (nextValue) => {
        if (!editingCell) return;
        const finalValue = nextValue !== undefined ? nextValue : editValue;

        // Update local state
        // In RPC context, this would be an Optimistic UI update + API call
        setRows(prev => prev.map((row) => {
            const rid = row ? (typeof rowKey === 'function' ? rowKey(row) : row[rowKey]) : null;
            if (rid === editingCell.rowId) {
                return { ...row, [editingCell.colKey]: finalValue };
            }
            return row;
        }));

        // Notify backend of cell edit if callback provided
        if (onSaveCell) {
            onSaveCell(editingCell.rowId, editingCell.colKey, finalValue);
        }

        setEditingCell(null);
        inputRef.current?.blur();
    };

    // Auto-focus input on edit
    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingCell]);


    // When the virtual window changes (due to scroll), ensure required rows are loaded
    // Note: depending on the virtualizer instance alone won't retrigger the effect on scroll,
    // so we derive first/last indices and use them as dependencies.
    const virtualItems = virtualizer.getVirtualItems();
    const firstVisibleIndex = virtualItems.length ? virtualItems[0].index : 0;
    const lastVisibleIndex = virtualItems.length ? virtualItems[virtualItems.length - 1].index : -1;

    useEffect(() => {
        if (lastVisibleIndex < 0) return;
        const start = Math.max(0, firstVisibleIndex - 20);
        const end = Math.min((totalCount || 0) - 1, lastVisibleIndex + 20);
        fetchRangeIfNeeded(start, end);
    }, [firstVisibleIndex, lastVisibleIndex, totalCount, fetchRangeIfNeeded]);

    // key resolver
    const getRowKey = useCallback((row, index) => {
        if (row) return typeof rowKey === 'function' ? rowKey(row) : row[rowKey];
        return `skeleton-${index}`;
    }, [rowKey]);

    const containerHeightClass = fullHeight ? 'h-screen' : 'h-full max-h-full min-h-0';
    const containerStyle = !fullHeight
        ? { maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }
        : undefined;

    // --- Column Auto-fit on initial data load ---
    const measureTextWidth = useCallback((text, font = '14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial') => {
        if (typeof document === 'undefined') return String(text || '').length * 8;
        const canvas = measureTextWidth._canvas || (measureTextWidth._canvas = document.createElement('canvas'));
        const ctx = canvas.getContext('2d');
        ctx.font = font;
        const metrics = ctx.measureText(String(text ?? ''));
        return metrics.width;
    }, []);

    const computeAutoWidths = useCallback((cols, sampleRows) => {
        const MIN_W = 60;
        const MAX_W = 500;
        // Body cell horizontal padding: px-4 left + px-4 right
        const CELL_PADDING = 32;
        // Header container padding: pl-4 (16) + pr-6 (24) = 40
        const HEADER_PADDING = 40;
        // Label right gap before icon: pr-2 (8)
        const LABEL_GAP = 8;
        // Sort icon button visual width reserve (icon + button padding)
        const SORT_ICON = 22; // slightly generous to avoid truncation
        // Invisible resize handle width: w-1.5 ≈ 6px
        const RESIZE_HANDLE = 6;

        const font = '14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
        return cols.map(c => {
            // Start from header width needs (label + paddings + optional icon + handle)
            const hasSortIcon = c.sortable !== false;
            let maxContent = measureTextWidth(c.label || c.key, font)
                + HEADER_PADDING
                + (hasSortIcon ? (LABEL_GAP + SORT_ICON) : 0)
                + RESIZE_HANDLE;

            // Consider body cell content with its own padding
            for (let r of sampleRows) {
                if (!r) continue;
                let v = r[c.key];
                if (c.type === 'money' && v != null) v = `$${v}`;
                const w = measureTextWidth(v == null ? '' : String(v), font) + CELL_PADDING;
                if (w > maxContent) maxContent = w;
            }
            const nextWidth = Math.min(MAX_W, Math.max(MIN_W, Math.ceil(maxContent)));
            return { ...c, width: nextWidth };
        });
    }, [measureTextWidth]);

    // Auto-fit a single column based on current sample rows, and mark as userSized
    const autoFitColumn = useCallback((colKey) => {
        if (!columns || columns.length === 0) return;
        const target = columns.find(c => c.key === colKey);
        if (!target) return;
        // gather first up-to 50 realized rows
        const sample = [];
        for (let i = 0; i < rows.length && sample.length < 50; i++) {
            if (rows[i]) sample.push(rows[i]);
        }
        const [computed] = computeAutoWidths([target], sample);
        if (!computed) return;
        setColumns(prev => prev.map(c => c.key === colKey ? { ...c, width: computed.width, userSized: true } : c));
    }, [columns, rows, computeAutoWidths]);

    // Perform auto-fit once when we have columns and at least a few loaded rows
    useEffect(() => {
        if (autoFitDoneRef.current) return;
        if (!columns || columns.length === 0) return;
        // gather first up-to 50 realized rows
        const sample = [];
        for (let i = 0; i < rows.length && sample.length < 50; i++) {
            if (rows[i]) sample.push(rows[i]);
        }
        if (sample.length === 0) return; // wait until some rows load
        const nextComputed = computeAutoWidths(columns, sample);
        // Apply auto-fit only to columns that the user has not manually resized
        setColumns(prev => {
            const compByKey = new Map(nextComputed.map(c => [c.key, c]));
            return prev.map(c => {
                if (c.userSized) return c; // preserve user width
                const comp = compByKey.get(c.key);
                return comp ? { ...c, width: comp.width } : c;
            });
        });
        autoFitDoneRef.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columns, rows]);

    // --- Column Resize (drag) ---
    const onHeaderResizeMouseDown = (e, colKey) => {
        e.preventDefault();
        e.stopPropagation();
        const col = columns.find(c => c.key === colKey);
        if (!col) return;
        isDraggingCol.current = true;
        dragInfoRef.current = { key: colKey, startX: e.clientX, startWidth: col.width || 120, moved: false };
        // Add listeners on window to track mouse move/up
        window.addEventListener('mousemove', onHeaderResizeMouseMove);
        window.addEventListener('mouseup', onHeaderResizeMouseUp, { once: true });
        // Add a class to body to avoid text selection
        document.body.classList.add('select-none', 'cursor-col-resize');
    };

    const onHeaderResizeMouseMove = (e) => {
        if (!isDraggingCol.current || !dragInfoRef.current) return;
        const { key, startX, startWidth } = dragInfoRef.current;
        const delta = e.clientX - startX;
        const MIN_W = 50;
        const MAX_W = 800;
        const nextW = Math.max(MIN_W, Math.min(MAX_W, Math.round(startWidth + delta)));
        if (Math.abs(delta) > 2) {
            dragInfoRef.current.moved = true;
        }
        setColumns(prev => prev.map(c => c.key === key ? { ...c, width: nextW, userSized: true } : c));
    };

    const onHeaderResizeMouseUp = () => {
        // If there was an actual drag movement, mark to suppress the subsequent click
        if (dragInfoRef.current?.moved) {
            wasResizingColRef.current = true;
            // Clear the flag shortly after the click microtask
            setTimeout(() => { wasResizingColRef.current = false; }, 0);
        }
        isDraggingCol.current = false;
        dragInfoRef.current = null;
        window.removeEventListener('mousemove', onHeaderResizeMouseMove);
        document.body.classList.remove('select-none', 'cursor-col-resize');
    };

    return (
        <div
            className={`flex flex-col ${containerHeightClass} w-full bg-white text-slate-800 font-sans min-h-0 ${!fullHeight ? 'overflow-hidden' : ''}`}
            style={containerStyle}
        >
            {/* --- Toolbar (optional) --- */}
            {showToolbar && (
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/50">
                    <div className="flex items-center space-x-4">
                        <div className="bg-blue-600 p-2 rounded-lg shadow-sm text-white">
                            <Database size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-800 tracking-tight">{title}</h1>
                            <div className="flex items-center space-x-2 text-xs text-gray-500 mt-0.5">
                                <span>{(totalCount || 0).toLocaleString()} rows</span>
                                {/*<span>•</span>*/}
                                {/*<span>{isLoading ? 'Fetching...' : `Loaded in ${loadTime.toFixed(0)}ms`}</span>*/}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center space-x-3">
                        <button
                            onClick={async () => {
                                setIsLoading(true);
                                setError(null);
                                inFlight.current.clear();
                                try {
                                    await fetchMeta();
                                } finally {
                                    setIsLoading(false);
                                }
                            }}
                            disabled={isLoading}
                            className="flex items-center space-x-2 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                            <span>Reload Data</span>
                        </button>

                        <button
                            onClick={onExportCsv || undefined}
                            className="flex items-center space-x-2 px-3 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors"
                        >
                            <Download size={14} />
                            <span>Export CSV</span>
                        </button>
                    </div>
                </div>
            )}

            {/* --- Virtualized Body --- */}
            <div
                ref={parentRef}
                className="flex-1 overflow-auto relative bg-white min-h-0"
                tabIndex={-1} // Allow div to catch keys if needed
            >
                {/* --- Header (Sticky within scroll area) --- */}
                <div className="sticky top-0 z-30 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm shadow-sm">
                    <div className="flex divide-x divide-gray-200">
                        {columns.map(col => (
                            <div
                                key={col.key}
                                style={{ width: col.width, flexShrink: 0 }}
                                className="relative pl-4 pr-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider select-none hover:bg-gray-100 cursor-default flex items-center justify-between group transition-colors"
                            >
                                <span
                                    className="truncate pr-2"
                                    onDoubleClick={(e) => {
                                        // header double click custom action (not sort)
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (isDraggingCol.current || wasResizingColRef.current) return;
                                        if (typeof col.onHeaderDoubleClick === 'function') {
                                            try {
                                                const rect = (e.currentTarget)?.getBoundingClientRect?.();
                                                col.onHeaderDoubleClick(col, { event: e, anchorRect: rect });
                                            } catch { /* noop */ }
                                        }
                                    }}
                                >
                                    {col.label}
                                </span>

                                {/* Sort icon hitbox */}
                                {col.sortable !== false && (
                                <button
                                    type="button"
                                    className="shrink-0 rounded hover:bg-gray-200/70 p-0.5 focus:outline-none"
                                    title={`Sort by ${col.label}`}
                                    aria-label={`Sort by ${col.label}`}
                                    onClick={(e) => {
                                        // prevent header/resize interactions
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (isDraggingCol.current || wasResizingColRef.current) return;
                                        handleSort(col.key);
                                    }}
                                >
                                    {sortConfig.key === col.key ? (
                                        <span className="text-indigo-600 leading-none flex items-center justify-center">
                                            {sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </span>
                                    ) : (
                                        <span className="text-gray-300 leading-none flex flex-col items-center justify-center" style={{ lineHeight: 0.8 }}>
                                            <ChevronUp size={12} />
                                            <ChevronDown size={12} />
                                        </span>
                                    )}
                                </button>
                                )}

                                {/* Resize handle */}
                                <div
                                    onMouseDown={(e) => onHeaderResizeMouseDown(e, col.key)}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        autoFitColumn(col.key);
                                    }}
                                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 bg-transparent hover:bg-indigo-400/50"
                                    role="separator"
                                    aria-orientation="vertical"
                                />
                            </div>
                        ))}
                        {/* Filler column */}
                        <div className="flex-1 min-w-[20px] bg-gray-50"></div>
                    </div>
                </div>

                {(!onFetchMeta || !onFetchRows) ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-3 px-6 text-center">
                        <AlertCircle size={32} className="text-amber-500" />
                        <p className="font-medium">No data providers supplied</p>
                        <p className="text-sm">Pass <code>onFetchMeta</code> and <code>onFetchRows</code> props to <code>Spreadsheet</code>. See <code>SpreadsheetDemo.jsx</code> for an example.</p>
                    </div>
                ) : isLoading && totalCount === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3">
                        <RefreshCw size={32} className="animate-spin text-indigo-500" />
                        <p>Loading dataset...</p>
                    </div>
                ) : (
                    <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                            const row = rows[virtualRow.index];
                            return (
                                <div
                                    key={getRowKey(row, virtualRow.index)}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                    className={`
                    flex divide-x divide-gray-100 hover:bg-blue-50/50 transition-colors border-b border-gray-100
                    ${row && selectedCell?.rowId === (typeof rowKey === 'function' ? rowKey(row) : row[rowKey]) ? 'bg-blue-50' : ''}
                  `}
                                >
                                    {columns.map(col => {
                                            const rid = row ? (typeof rowKey === 'function' ? rowKey(row) : row[rowKey]) : `skeleton-${virtualRow.index}`;
                                            const isSelected = row && selectedCell?.rowId === rid && selectedCell?.colKey === col.key;
                                            const colReadOnly = col.readOnly || (col.type === 'computed' && col.readOnly !== false);
                                            const canEdit = !readOnly && !colReadOnly;
                                            const isEditing = canEdit && row && editingCell?.rowId === rid && editingCell?.colKey === col.key;
                                            const extraCellClass = row
                                                ? (typeof col.cellClassName === 'function' ? col.cellClassName(row) : (col.cellClassName || ''))
                                                : '';

                                            return (
                                                <div
                                                    key={col.key}
                                                    id={`cell-${rid}-${col.key}`}
                                                    style={{ width: col.width, flexShrink: 0 }}
                                                className={`
                          relative px-4 flex items-center text-sm truncate group
                          ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}
                          ${isSelected ? 'ring-2 ring-indigo-500 ring-inset z-10' : ''}
                          ${canEdit ? 'cursor-pointer' : 'cursor-default'}
                          ${extraCellClass}
                        `}
                                                    onClick={() => {
                                                        // If any cell is being edited, ignore click selection to avoid closing the editor
                                                        if (editingCell) return;
                                                        if (row) handleCellClick(rid, col.key);
                                                    }}
                                                    onMouseDownCapture={(e) => {
                                                        // While actively editing this cell, swallow mouse down so parent handlers don't interfere
                                                        if (isEditing) {
                                                            e.stopPropagation();
                                                        }
                                                    }}
                                                    onDoubleClick={() => row && canEdit && handleDoubleClick(rid, col.key, row[col.key])}
                                                >
                                                    {isEditing ? (
                                                        <div
                                                            className="absolute inset-0"
                                                            onMouseDown={(e) => { e.stopPropagation(); }}
                                                            onPointerDown={(e) => { e.stopPropagation(); }}
                                                            onClick={(e) => { e.stopPropagation(); }}
                                                            onDoubleClick={(e) => { e.stopPropagation(); }}
                                                        >
                                                            {col.renderEditor ? (
                                                                col.renderEditor({
                                                                    row,
                                                                    value: editValue,
                                                                    setValue: setEditValue,
                                                                    onCommit: (v) => saveEdit(v),
                                                                    onCancel: () => setEditingCell(null),
                                                                    col,
                                                                })
                                                            ) : col.editor ? (
                                                                (() => {
                                                                    const EditorComp = col.editor;
                                                                    return (
                                                                        <EditorComp
                                                                            row={row}
                                                                            value={editValue}
                                                                            setValue={setEditValue}
                                                                            onCommit={(v) => saveEdit(v)}
                                                                            onCancel={() => setEditingCell(null)}
                                                                            col={col}
                                                                        />
                                                                    );
                                                                })()
                                                            ) : (
                                                                <input
                                                                    ref={inputRef}
                                                                    value={editValue}
                                                                    onChange={(e) => setEditValue(e.target.value)}
                                                                    onBlur={() => saveEdit()}
                                                                    onKeyDown={(e) => handleKeyDown(e, row.id, col.key)}
                                                                    className="absolute inset-0 w-full h-full px-4 border-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                                                />
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className={`
                            truncate w-full cursor-default
                            ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                            ${col.key === 'total' ? 'font-medium text-gray-900' : 'text-gray-600'}
                          `}>
                              {!row ? (
                                  <span className="inline-block h-3 w-24 bg-gray-200 rounded animate-pulse" />
                              ) : (
                                  typeof col.renderCell === 'function' ? (
                                      col.renderCell(row, row[col.key])
                                  ) : (
                                      col.type === 'money' ? (
                                          `$${row[col.key]}`
                                      ) : (
                                          row[col.key]
                                      )
                                  )
                              )}
                           </span>
                                                )}
                                                </div>
                                            );
                                        })}
                                    {/* Filler Cell for row */}
                                    <div className="flex-1 min-w-[20px]"></div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer Info (optional) */}
            {showFooter && (
                <div className="px-6 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
                    {/*<div className="flex items-center space-x-4">*/}
                    {/*    <span>DB Connection: <span className="text-emerald-600 font-medium">Active</span></span>*/}
                    {/*    <span>Latency: 24ms</span>*/}
                    {/*</div>*/}
                    <div>
                        Scroll to load more • {readOnly ? 'Read-only view' : 'Double-click to edit'}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Spreadsheet;