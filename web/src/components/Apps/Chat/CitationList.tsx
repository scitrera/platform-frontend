import React, {useState} from 'react';
import {BookOpen, ChevronDown, ChevronRight, ExternalLink} from 'lucide-react';
import type {Citation} from '@/types/chat';

interface CitationListProps {
    citations?: Citation[] | null;
}

/**
 * Displays source citations/references at the bottom of an AI message.
 * Renders only when citations data is present.
 *
 * Each citation has: { title: string, url?: string, snippet?: string, source?: string }
 */
export function CitationList({citations}: CitationListProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!citations || citations.length === 0) return null;

    return (
        <div className="mt-2 border-t border-gray-100 pt-2">
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
                {isExpanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                <BookOpen size={12}/>
                <span>{citations.length} {citations.length === 1 ? 'source' : 'sources'}</span>
            </button>

            {isExpanded && (
                <div className="mt-1.5 space-y-1">
                    {citations.map((citation, index) => (
                        <CitationItem key={index} citation={citation} index={index + 1}/>
                    ))}
                </div>
            )}
        </div>
    );
}

interface CitationItemProps {
    citation: Citation & {snippet?: string};
    index: number;
}

function CitationItem({citation, index}: CitationItemProps) {
    return (
        <div className="text-xs flex items-start gap-1.5 py-1">
            <span className="text-gray-400 font-mono flex-shrink-0">[{index}]</span>
            <div className="min-w-0">
                {citation.url ? (
                    <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-0.5"
                    >
                        {citation.title || citation.source || citation.url}
                        <ExternalLink size={10}/>
                    </a>
                ) : (
                    <span className="text-gray-700 font-medium">
                        {citation.title || citation.source || 'Unknown source'}
                    </span>
                )}
                {citation.snippet && (
                    <p className="text-gray-500 mt-0.5 line-clamp-2">{citation.snippet}</p>
                )}
            </div>
        </div>
    );
}
