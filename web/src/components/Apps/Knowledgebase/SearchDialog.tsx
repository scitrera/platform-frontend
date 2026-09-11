import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Search} from 'lucide-react';
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useKnowledgebaseState} from '@/hooks/useKnowledgebaseState';
import type {KbArticle} from '@/types/knowledgebase';

interface SearchDialogProps {
    open: boolean;
    onClose: () => void;
}

export function SearchDialog({open, onClose}: SearchDialogProps) {
    const {articles} = useKnowledgebaseState();
    const updateAppUrl = useAppPanelStore(s => s.updateAppUrl);
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setQuery('');
            // Defer focus so the dialog is fully mounted
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    const results = useMemo<KbArticle[]>(() => {
        const q = query.trim().toLowerCase();
        if (!q) return articles.slice(0, 20);
        return articles.filter(a => a.title.toLowerCase().includes(q)).slice(0, 30);
    }, [query, articles]);

    const handleSelect = useCallback((article: KbArticle) => {
        updateAppUrl({path: `articles/${article.id}`});
        onClose();
    }, [updateAppUrl, onClose]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-lg p-0 gap-0">
                <DialogHeader className="sr-only">
                    <DialogTitle>Search articles</DialogTitle>
                </DialogHeader>
                <div className="flex items-center gap-2 px-4 py-3 border-b">
                    <Search size={16} className="text-gray-400 flex-shrink-0"/>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search articles..."
                        className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
                    />
                </div>
                <div className="max-h-80 overflow-y-auto">
                    {results.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-center text-gray-400">
                            No articles match your search.
                        </div>
                    ) : (
                        results.map(a => (
                            <button
                                key={a.id}
                                onClick={() => handleSelect(a)}
                                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 last:border-0"
                            >
                                <span className="text-sm text-gray-800">{a.title}</span>
                                <span className="ml-auto text-xs text-gray-400 flex-shrink-0 capitalize">
                                    {a.article_type}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
