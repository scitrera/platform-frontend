import React from 'react';
import {
    Plus,
    FolderOpen,
    Trash2,
    Globe,
    FilePlus,
    Regex,
    FileText,
    Link2,
    ChevronRight,
    Loader2
} from 'lucide-react';

const SOURCE_TYPES = {
    FILE: 'file',
    GLOB: 'glob',
    INTERNAL: 'internal', // dataset reference
    WEB: 'web'
};

export default function DatasetSourcesList({
                                               ds,
                                               setDs,
                                               selectedSourceId,
                                               setSelectedSourceId,
                                               selectedSubSourceKey = null,
                                               onSelectSubSource = null,
                                               onSelectTopLevel = null,
                                               readOnly = false,
                                               onAddFiles,
                                               onAddGlob,
                                               onAddInternal,
                                               onAddWeb,
                                               onRemoveSource,
                                               onResolveGlob // async (pattern, sourceId) => [{label, path, docId, provider}]
                                           }) {
    const [showSourcesMenu, setShowSourcesMenu] = React.useState(false);
    const buttonRef = React.useRef(null);
    const menuRef = React.useRef(null);
    const [expanded, setExpanded] = React.useState(() => new Set());
    const [loadingGlobs, setLoadingGlobs] = React.useState(() => new Set());

    // Close the add-sources popup when clicking outside or pressing Escape
    React.useEffect(() => {
        if (!showSourcesMenu) return;
        const handleDocMouseDown = (e) => {
            const btn = buttonRef.current;
            const menu = menuRef.current;
            const target = e.target;
            const clickedInsideBtn = btn && btn.contains(target);
            const clickedInsideMenu = menu && menu.contains(target);
            if (!clickedInsideBtn && !clickedInsideMenu) {
                setShowSourcesMenu(false);
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setShowSourcesMenu(false);
        };
        document.addEventListener('mousedown', handleDocMouseDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleDocMouseDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [showSourcesMenu]);

    const toggleExpand = async (src) => {
        const id = src.id;
        const isCurrentlyExpanded = expanded.has(id);

        // Toggle expansion state
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });

        // If expanding a glob source that hasn't been resolved yet, resolve it
        if (!isCurrentlyExpanded && src.type === SOURCE_TYPES.GLOB && onResolveGlob) {
            const hasFiles = Array.isArray(src?.payload?.files) && src.payload.files.length > 0;
            if (!hasFiles && !loadingGlobs.has(id)) {
                setLoadingGlobs(prev => new Set(prev).add(id));
                try {
                    const files = await onResolveGlob(src.payload?.pattern, id);
                    // Update the source with resolved files
                    setDs(prev => ({
                        ...prev,
                        sources: prev.sources.map(s =>
                            s.id === id
                                ? {...s, payload: {...s.payload, files: files || []}}
                                : s
                        )
                    }));
                } catch (err) {
                    console.error('Failed to resolve glob pattern:', err);
                } finally {
                    setLoadingGlobs(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                }
            }
        }
    };

    const handleSelectTop = (src) => {
        setSelectedSourceId(src.id);
        onSelectTopLevel && onSelectTopLevel(src);
    };

    const childKey = (child) => child?.payload?.path || child?.payload?.docId || child?.label;

    return (
        <div className="w-96 border-r border-slate-200 bg-white flex flex-col min-h-0 relative z-0">
            <div className="p-4 border-b border-slate-200 bg-slate-50/30">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Dataset Name</div>
                <input className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                       value={ds.name}
                       onChange={e => !readOnly && setDs(prev => ({...prev, name: e.target.value}))}
                       placeholder="Enter dataset name..."
                       readOnly={readOnly}
                       disabled={readOnly}
                />
            </div>
            {/* Sources header with (+) menu */}
            <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between relative">
                <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-slate-700">Sources</div>
                    <div
                        className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full font-medium">{ds.sources.length}</div>
                </div>
                {!readOnly && (
                    <div className="relative">
                        <button
                            className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Add source"
                            onClick={() => setShowSourcesMenu(v => !v)}
                            ref={buttonRef}
                        >
                            <Plus className="w-5 h-5"/>
                        </button>

                        {showSourcesMenu && (
                            <div
                                className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                                ref={menuRef}
                            >
                                <button
                                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center transition-colors"
                                    onClick={() => {
                                        setShowSourcesMenu(false);
                                        onAddFiles && onAddFiles();
                                    }}
                                >
                                    <FilePlus className="w-4 h-4 mr-3 text-slate-400"/> Add Files
                                </button>
                                <button
                                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center transition-colors"
                                    onClick={() => {
                                        setShowSourcesMenu(false);
                                        onAddGlob && onAddGlob();
                                    }}
                                >
                                    <Regex className="w-4 h-4 mr-3 text-slate-400"/> Add Glob Pattern
                                </button>
                                <button
                                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center transition-colors"
                                    onClick={() => {
                                        setShowSourcesMenu(false);
                                        onAddInternal && onAddInternal();
                                    }}
                                >
                                    <FolderOpen className="w-4 h-4 mr-3 text-slate-400"/> Add from Dataset
                                </button>
                                <button
                                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center transition-colors"
                                    onClick={() => {
                                        setShowSourcesMenu(false);
                                        onAddWeb && onAddWeb();
                                    }}
                                >
                                    <Globe className="w-4 h-4 mr-3 text-slate-400"/> Add from URL
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-auto p-2 space-y-1 bg-slate-50/30">
                {ds.sources.map(src => {
                    const isGlob = src.type === SOURCE_TYPES.GLOB;
                    const hasChildren = isGlob && Array.isArray(src?.payload?.files) && src.payload.files.length > 0;
                    const isLoading = loadingGlobs.has(src.id);
                    const isExpanded = expanded.has(src.id);
                    const showExpanded = isExpanded && (hasChildren || isLoading);
                    return (
                        <div key={src.id} className="space-y-1">
                            <div
                                className={`group px-3 py-2.5 text-sm rounded-lg cursor-pointer border border-transparent flex items-center justify-between transition-all ${selectedSourceId === src.id ? 'bg-white border-blue-200 shadow-sm ring-1 ring-blue-100' : 'hover:bg-white hover:border-slate-200 hover:shadow-sm'}`}
                                onClick={() => {
                                    if (hasChildren || isGlob) toggleExpand(src);
                                    handleSelectTop(src);
                                }}>
                                <div className="flex items-center space-x-3 min-w-0">
                                    <div
                                        className={`p-1.5 rounded-md shrink-0 ${selectedSourceId === src.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-600'}`}>
                                        {src.type === SOURCE_TYPES.FILE && <FileText className="w-4 h-4"/>}
                                        {src.type === SOURCE_TYPES.GLOB && <Regex className="w-4 h-4"/>}
                                        {src.type === SOURCE_TYPES.INTERNAL && <FolderOpen className="w-4 h-4"/>}
                                        {src.type === SOURCE_TYPES.WEB && <Link2 className="w-4 h-4"/>}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span
                                            className={`truncate font-medium ${selectedSourceId === src.id ? 'text-blue-900' : 'text-slate-700'}`}
                                            title={src.label}>{src.label}</span>
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                                            {src.type}{hasChildren ? ` · ${src.payload.files.length}` : ''}{isLoading ? ' · loading...' : ''}
                                        </span>
                                    </div>
                                </div>

                                {isGlob ? (
                                    isLoading ? (
                                        <Loader2 className="w-4 h-4 text-blue-400 animate-spin"/>
                                    ) : (
                                        <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${isExpanded ? 'rotate-90 text-blue-400' : ''}`}/>
                                    )
                                ) : (
                                    selectedSourceId === src.id && (<ChevronRight className="w-4 h-4 text-blue-300"/>)
                                )}

                                {!readOnly && (
                                    <button
                                        className={`p-1 rounded hover:bg-red-100 text-slate-300 hover:text-red-600 transition-colors ${selectedSourceId === src.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveSource && onRemoveSource(src.id);
                                        }}>
                                        <Trash2 className="w-4 h-4"/>
                                    </button>
                                )}
                            </div>

                            {showExpanded && (
                                <div className="ml-5 mr-1 rounded-md border border-slate-200 bg-white/70">
                                    {isLoading && (
                                        <div className="flex items-center justify-center py-3 text-sm text-slate-500">
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin"/>
                                            Resolving pattern...
                                        </div>
                                    )}
                                    {!isLoading && hasChildren && src.payload.files.map((child, idx) => {
                                        const cKey = childKey(child);
                                        const isSelected = selectedSourceId === src.id && selectedSubSourceKey && cKey === selectedSubSourceKey;
                                        return (
                                            <div key={`${src.id}::${idx}`} className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer border-b last:border-b-0 ${isSelected ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-700'}`}
                                                 onClick={(e) => {
                                                     e.stopPropagation();
                                                     onSelectSubSource && onSelectSubSource(child, src);
                                                 }}>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <FileText className={`w-4 h-4 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}/>
                                                    <span className="truncate" title={child.label}>{child.label}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {!isLoading && isExpanded && !hasChildren && (
                                        <div className="py-3 px-4 text-sm text-slate-400 italic text-center">
                                            No matching files found
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
                {ds.sources.length === 0 && (
                    <div
                        className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-200 rounded-lg m-2">
                        <div className="p-3 bg-slate-50 rounded-full mb-3">
                            <Plus className="w-6 h-6 text-slate-300"/>
                        </div>
                        <p className="text-sm font-medium text-slate-600">No sources yet</p>
                        {!readOnly && <p className="text-xs text-slate-400 mt-1">Use the + button to add data</p>}
                    </div>
                )}
            </div>
        </div>
    );
}
