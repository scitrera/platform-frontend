import {useCallback, useEffect, useState} from 'react';
import {Search} from 'lucide-react';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {AppCloseButton} from '../AppCloseButton';
import {useKnowledgebaseState} from '@/hooks/useKnowledgebaseState';
import {ArticleSidebar} from './ArticleSidebar';
import {ArticleView} from './ArticleView';
import {MemoryView} from './MemoryView';
import {GraphView} from './GraphView';
import {SearchDialog} from './SearchDialog';
import {RegenerateButton} from './RegenerateButton';

interface KnowledgebaseAppProps {
    workspaceId: string;
    panelConfig: unknown;
    showCloseButton?: boolean;
    onClose?: () => void;
}

function EmptyKnowledgebase({onRegenerate, canAdmin}: {onRegenerate: () => void; canAdmin: boolean}) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="text-4xl mb-4 text-gray-200">
                <Search size={48}/>
            </div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">No knowledgebase generated yet</h2>
            <p className="text-sm text-gray-500 max-w-sm mb-6">
                {canAdmin
                    ? 'Generate a knowledgebase to explore communities, entities, and the relationships between your workspace memories.'
                    : 'No knowledgebase has been generated for this workspace yet. Ask a workspace admin to generate it.'}
            </p>
            {canAdmin && (
                <button
                    onClick={onRegenerate}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                    Generate Knowledgebase
                </button>
            )}
        </div>
    );
}

export default function KnowledgebaseApp({workspaceId, showCloseButton, onClose}: KnowledgebaseAppProps) {
    const {
        metadata,
        articles,
        loading,
        error,
        canAdmin,
        regenerate,
    } = useKnowledgebaseState();

    const appPath = useAppPanelStore(s => s.appPath);
    const updateAppUrl = useAppPanelStore(s => s.updateAppUrl);

    const [searchOpen, setSearchOpen] = useState(false);

    // Initial data load is owned by KnowledgebaseContext (connection-aware:
    // loads once the socket is connected + a workspace is selected, and reloads
    // on workspace change). No mount-time load here — it would race the socket.

    // Cmd-K / Ctrl-K / '/' to open search
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setSearchOpen(true);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Derive active tab and article id from appPath
    // appPath: '', 'articles', 'articles/<id>', 'graph'
    const normalizedPath = (appPath ?? '').replace(/^\/+|\/+$/g, '');
    const isGraphTab = normalizedPath === 'graph';
    const activeArticleId = normalizedPath.startsWith('articles/')
        ? normalizedPath.slice('articles/'.length)
        : null;
    const activeMemoryId = normalizedPath.startsWith('memory/')
        ? normalizedPath.slice('memory/'.length)
        : null;

    const handleTabArticles = () => updateAppUrl({path: 'articles'});
    // GraphView owns its own data loading (and the memories toggle), so switching
    // to the tab just updates the route.
    const handleTabGraph = () => updateAppUrl({path: 'graph'});

    const handleQuickRegenerate = useCallback(() => {
        regenerate(false);
    }, [regenerate]);

    const hasKb = metadata !== null && articles.length > 0;

    // Render the body content
    const renderBody = () => {
        if (loading && !hasKb) {
            return (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                    Loading...
                </div>
            );
        }

        if (error && !hasKb) {
            return (
                <div className="flex-1 flex items-center justify-center text-sm text-red-500 px-6 text-center">
                    {error}
                </div>
            );
        }

        if (!hasKb && !loading) {
            return <EmptyKnowledgebase onRegenerate={handleQuickRegenerate} canAdmin={canAdmin}/>;
        }

        if (isGraphTab) {
            // GraphView is self-loading and renders its own loading/empty states.
            return (
                <div className="flex-1 min-h-0 flex">
                    <GraphView/>
                </div>
            );
        }

        return (
            <div className="flex-1 min-h-0 flex">
                <ArticleSidebar/>
                <main className="flex-1 min-w-0 min-h-0 overflow-auto bg-white">
                    {activeMemoryId ? (
                        <MemoryView memoryId={activeMemoryId}/>
                    ) : activeArticleId ? (
                        <ArticleView articleId={activeArticleId}/>
                    ) : (
                        <div className="flex items-center justify-center h-full text-sm text-gray-400">
                            Select an article from the sidebar.
                        </div>
                    )}
                </main>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="flex-shrink-0 border-b bg-gray-50 px-4 py-2 flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-700">Knowledgebase</h2>

                {/* Tab switcher */}
                <div className="flex items-center gap-1 ml-2">
                    <button
                        onClick={handleTabArticles}
                        className={`px-3 py-1 text-sm rounded-md transition-colors ${
                            !isGraphTab
                                ? 'bg-white shadow-sm text-gray-800 font-medium border border-gray-200'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Articles
                        {metadata && (
                            <span className="ml-1.5 text-xs text-gray-400">{metadata.article_count}</span>
                        )}
                    </button>
                    <button
                        onClick={handleTabGraph}
                        className={`px-3 py-1 text-sm rounded-md transition-colors ${
                            isGraphTab
                                ? 'bg-white shadow-sm text-gray-800 font-medium border border-gray-200'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Graph
                    </button>
                </div>

                <div className="flex-1"/>

                {/* Search button */}
                <button
                    onClick={() => setSearchOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors border border-gray-200 bg-white"
                    title="Search articles (Cmd+K)"
                >
                    <Search size={14}/>
                    <span>Search</span>
                    <kbd className="ml-1 text-xs text-gray-300 font-mono">⌘K</kbd>
                </button>

                {/* Regenerate button — workspace-admins only. It opens a
                    confirmation dialog (no immediate regen), so it's safe in
                    the header. */}
                {canAdmin && <RegenerateButton/>}

                {showCloseButton && onClose && (
                    <AppCloseButton onClose={onClose} label="Knowledgebase"/>
                )}
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 flex flex-col">
                {renderBody()}
            </div>

            <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)}/>
        </div>
    );
}
