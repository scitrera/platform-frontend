import React, {useEffect, useRef} from 'react';
import {cn} from '@/lib/utils';
import type {Artifact} from '../../utils/artifactExtractor';
import {ArtifactListBody} from '../Apps/Chat/ArtifactList';

export interface ArtifactsPopoutProps {
    open: boolean;
    onClose: () => void;
    artifacts: Artifact[];
    onArtifactSelect: (messageId: string) => void;
}

/**
 * Sidebar-mode artifacts overlay. Slides in from the rail's right edge,
 * covering the messages area within the rail (leaving the input visible).
 * Auto-closes when an artifact is selected; click-outside also dismisses
 * (the rail's toggle buttons carry data-chat-rail-toggle and are exempted).
 * Shares its list body with the fullscreen RightSidebar so the two never drift.
 */
export default function ArtifactsPopout({
    open,
    onClose,
    artifacts,
    onArtifactSelect,
}: ArtifactsPopoutProps) {
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (panelRef.current?.contains(target)) return;
            if (target.closest('[data-chat-rail-toggle]')) return;
            onClose();
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [open, onClose]);

    const handleSelect = (messageId: string) => {
        onArtifactSelect(messageId);
        onClose();
    };

    return (
        <div
            ref={panelRef}
            className={cn(
                'absolute top-0 right-0 bottom-0 z-20 w-72 bg-gray-50 border-l border-gray-200 shadow-md',
                'transition-transform duration-300 ease-in-out',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <ArtifactListBody artifacts={artifacts} onArtifactSelect={handleSelect}/>
        </div>
    );
}
