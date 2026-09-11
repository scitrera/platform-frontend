import React, { useState } from 'react';
import { Brain, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface ReasoningDisplayProps {
    content: string;
    isStreaming?: boolean;
}

/**
 * One model-reasoning trace, collapsed to a single row.
 *
 * Rendered INLINE at its position in the message (see
 * ``MessageItem.renderSpecContent``) — a tool-loop turn emits one reasoning
 * part per model call, so a turn shows several of these interleaved with the
 * tool-call rows. Styled to match ``ToolLine`` so a turn's inline rows read as
 * one family.
 */
export function ReasoningDisplay({ content, isStreaming = false }: ReasoningDisplayProps) {
    const [isOpen, setIsOpen] = useState(false);

    if (!content) return null;

    const words = content.trim() ? content.trim().split(/\s+/).length : 0;

    return (
        <div className="my-2 rounded-md border border-gray-200 bg-white text-sm">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CollapsibleTrigger asChild>
                    <button
                        type="button"
                        className="w-full flex items-center gap-2 px-2.5 py-1 text-left text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        {isOpen ? <ChevronDown size={12} className="shrink-0"/> : <ChevronRight size={12} className="shrink-0"/>}
                        {isStreaming ? (
                            <Loader2 size={14} className="shrink-0 text-purple-400 animate-spin"/>
                        ) : (
                            <Brain size={14} className="shrink-0 text-purple-400"/>
                        )}
                        <span className="shrink-0 text-xs font-medium">
                            {isStreaming ? 'Thinking…' : 'Reasoning'}
                        </span>
                        {!isStreaming && words > 0 && (
                            <span className="shrink-0 text-[11px] text-gray-400">
                                {words} word{words === 1 ? '' : 's'}
                            </span>
                        )}
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="px-2.5 pb-2">
                        <pre className={cn(
                            'max-h-64 overflow-y-auto rounded bg-gray-50 border border-gray-100 p-2',
                            'text-[11px] font-mono text-gray-500 whitespace-pre-wrap break-words leading-relaxed',
                        )}>
                            {content}
                            {isStreaming && <span className="inline-block w-1.5 h-3 bg-purple-300 ml-0.5 animate-pulse"/>}
                        </pre>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
