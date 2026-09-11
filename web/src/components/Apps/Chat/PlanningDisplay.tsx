import React, { useState } from 'react';
import { Check, Circle, Loader2, ChevronDown, ChevronRight, ListTodo } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface PlanStep {
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
}

interface PlanningDisplayProps {
    steps: PlanStep[];
    title?: string;
}

function StepIcon({ status }: { status: PlanStep['status'] }) {
    if (status === 'completed') {
        return <Check size={13} className="text-emerald-500 shrink-0" />;
    }
    if (status === 'in_progress') {
        return <Loader2 size={13} className="text-blue-500 animate-spin shrink-0" />;
    }
    return <Circle size={13} className="text-gray-300 shrink-0" />;
}

export function PlanningDisplay({ steps, title = 'Plan' }: PlanningDisplayProps) {
    const [isOpen, setIsOpen] = useState(true);

    if (!steps || steps.length === 0) return null;

    const completedCount = steps.filter(s => s.status === 'completed').length;
    const hasInProgress = steps.some(s => s.status === 'in_progress');

    return (
        <div className="mt-2 border-t border-gray-100 pt-2">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CollapsibleTrigger asChild>
                    <button
                        type="button"
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors w-full text-left"
                    >
                        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <ListTodo size={12} />
                        <span className="font-medium">{title}</span>
                        <span className="text-gray-300 ml-0.5">
                            {completedCount}/{steps.length}
                            {hasInProgress && ' · running'}
                        </span>
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="mt-1.5 space-y-1">
                        {steps.map((step) => (
                            <div
                                key={step.id}
                                className={cn(
                                    'flex items-start gap-2 text-xs px-1.5 py-1 rounded',
                                    step.status === 'in_progress' && 'bg-blue-50',
                                    step.status === 'completed' && 'opacity-60'
                                )}
                            >
                                <span className="mt-0.5">
                                    <StepIcon status={step.status} />
                                </span>
                                <span className={cn(
                                    'text-gray-700 leading-snug',
                                    step.status === 'completed' && 'line-through text-gray-400'
                                )}>
                                    {step.description}
                                </span>
                            </div>
                        ))}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
