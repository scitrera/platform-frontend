import React from 'react';
import { User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Format a timestamp for display below message bubbles. */
function formatTimestamp(ts: number): string {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts));
}
import { PlanningDisplay, PlanStep } from './PlanningDisplay';
import { ReasoningDisplay } from './ReasoningDisplay';
import { ArtifactPanel, Artifact } from './ArtifactPanel';

interface MessageBubbleProps {
    sender: 'user' | 'assistant';
    children: React.ReactNode;
    timestamp?: number;
    avatar?: string;
    planning?: PlanStep[];
    reasoning?: string;
    artifacts?: Artifact[];
    threadId?: string;
}

function Avatar({ sender, avatar }: { sender: 'user' | 'assistant'; avatar?: string }) {
    const isUser = sender === 'user';

    if (avatar && !avatar.startsWith('http')) {
        // Treat as initials string
        return (
            <div className={cn(
                'flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-semibold shrink-0',
                isUser ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-600'
            )}>
                {avatar.slice(0, 2).toUpperCase()}
            </div>
        );
    }

    if (avatar) {
        return (
            <img
                src={avatar}
                alt={isUser ? 'User' : 'Assistant'}
                className="w-7 h-7 rounded-full object-cover shrink-0"
            />
        );
    }

    // Default icon avatar
    return (
        <div className={cn(
            'flex items-center justify-center w-7 h-7 rounded-full shrink-0',
            isUser ? 'bg-gray-200 text-gray-500' : 'bg-blue-100 text-blue-500'
        )}>
            {isUser ? <User size={14} /> : <Bot size={14} />}
        </div>
    );
}

export function MessageBubble({
    sender,
    children,
    timestamp,
    avatar,
    planning,
    reasoning,
    artifacts,
    threadId = '',
}: MessageBubbleProps) {
    const isUser = sender === 'user';
    const formattedTime = timestamp ? formatTimestamp(timestamp) : null;

    return (
        <div className={cn(
            'w-full flex items-end gap-2',
            isUser ? 'justify-end' : 'justify-start'
        )}>
            {/* Avatar — left side for assistant */}
            {!isUser && (
                <div className="mb-1">
                    <Avatar sender={sender} avatar={avatar} />
                </div>
            )}

            {/* Bubble */}
            <div className={cn(
                'relative group flex flex-col',
                isUser ? 'items-end max-w-[75%]' : 'items-start max-w-[85%]'
            )}>
                <div className={cn(
                    'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    isUser
                        ? 'bg-gray-100 text-gray-900 rounded-br-sm'
                        : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm'
                )}>
                    {/* Main content */}
                    <div>{children}</div>

                    {/* Planning steps */}
                    {planning && planning.length > 0 && (
                        <PlanningDisplay steps={planning} />
                    )}

                    {/* Reasoning / thinking */}
                    {reasoning && (
                        <ReasoningDisplay content={reasoning} />
                    )}

                    {/* Artifacts */}
                    {artifacts && artifacts.length > 0 && (
                        <ArtifactPanel artifacts={artifacts} threadId={threadId} />
                    )}
                </div>

                {/* Timestamp */}
                {formattedTime && (
                    <p className={cn(
                        'text-[10px] text-gray-400 mt-1 px-1',
                        isUser ? 'text-right' : 'text-left'
                    )}>
                        {formattedTime}
                    </p>
                )}
            </div>

            {/* Avatar — right side for user */}
            {isUser && (
                <div className="mb-1">
                    <Avatar sender={sender} avatar={avatar} />
                </div>
            )}
        </div>
    );
}
