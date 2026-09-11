import {useEffect, useState} from 'react';
import {ChevronLeft} from 'lucide-react';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useKnowledgebaseState} from '@/hooks/useKnowledgebaseState';
import {CHAT_UI_CONSTANTS} from '@/constants/AppConstants';
import {SciMarkdown} from '../Chat/SciMarkdown';
import {formatDateTime} from './utils';
import type {KbMemory} from '@/types/knowledgebase';

function Chip({label, value}: {label?: string; value: string}) {
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-gray-100 text-gray-600 border-gray-200">
            {label && <span className="opacity-60">{label}</span>}
            <span className="font-medium">{value}</span>
        </span>
    );
}

function pct(v: number | null | undefined): string | null {
    return typeof v === 'number' ? `${Math.round(v * 100)}%` : null;
}

interface MemoryViewProps {
    memoryId: string;
}

export function MemoryView({memoryId}: MemoryViewProps) {
    const {loadMemory, memoryCache} = useKnowledgebaseState();
    const updateAppUrl = useAppPanelStore(s => s.updateAppUrl);

    const [memory, setMemory] = useState<KbMemory | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function fetch() {
            setLoading(true);
            const result = await loadMemory(memoryId);
            if (!cancelled) {
                setMemory(result);
                setLoading(false);
            }
        }

        if (memoryCache[memoryId] !== undefined) {
            setMemory(memoryCache[memoryId]);
            setLoading(false);
        } else {
            fetch();
        }

        return () => {
            cancelled = true;
        };
    }, [memoryId, loadMemory, memoryCache]);

    const handleBack = () => updateAppUrl({path: 'articles'});

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Loading memory...
            </div>
        );
    }

    if (!memory) {
        return (
            <div className="p-6 text-sm text-gray-500">
                Memory not found.{' '}
                <button onClick={handleBack} className="text-blue-600 hover:underline">
                    Go back
                </button>
            </div>
        );
    }

    const chips: Array<{label?: string; value: string}> = [];
    if (memory.subtype) chips.push({value: memory.subtype});
    const importance = pct(memory.importance);
    if (importance) chips.push({label: 'Importance', value: importance});
    const trust = pct(memory.trust_score);
    if (trust) chips.push({label: 'Trust', value: trust});
    if (memory.source_document_id) chips.push({label: 'Source doc', value: '1'});
    for (const tag of memory.tags ?? []) {
        if (!tag.startsWith('doc:')) chips.push({value: tag});
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-3 flex-shrink-0">
                <button
                    onClick={handleBack}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                    <ChevronLeft size={16}/>
                    Back
                </button>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                    <h1 className="text-base font-semibold text-gray-800 truncate">Memory</h1>
                    {memory.type && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-purple-100 text-purple-700 border-purple-200">
                            {memory.type}
                        </span>
                    )}
                </div>
                {memory.created_at && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatDateTime(memory.created_at)}
                    </span>
                )}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
                {chips.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-4">
                        {chips.map((c, i) => (
                            <Chip key={`${c.label ?? ''}:${c.value}:${i}`} label={c.label} value={c.value}/>
                        ))}
                    </div>
                )}
                {memory.abstract && (
                    <p className="mb-4 text-sm text-gray-500 italic border-l-2 border-gray-200 pl-3">
                        {memory.abstract}
                    </p>
                )}
                <div className={CHAT_UI_CONSTANTS.MARKDOWN_PROSE}>
                    <SciMarkdown>{memory.content}</SciMarkdown>
                </div>
            </div>
        </div>
    );
}
