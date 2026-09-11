import {X} from 'lucide-react';
import {cn} from '@/lib/utils';

interface AppCloseButtonProps {
    onClose: () => void;
    /** App name for the hover/accessible label, e.g. "Library". */
    label?: string;
    className?: string;
}

/**
 * Standard "close this app panel" affordance (X in the app header), matching the
 * agent-app close button rendered by DynamicAppPlaceholder. Used by the native
 * apps (Library, Knowledgebase, Sharing) so they're closeable like agent-based
 * apps. Render it on the right of the app's header, gated on the panel's
 * ``showCloseButton``.
 */
export function AppCloseButton({onClose, label = 'App', className}: AppCloseButtonProps) {
    return (
        <button
            type="button"
            onClick={onClose}
            className={cn(
                'p-1.5 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-200 flex-shrink-0',
                className,
            )}
            title={`Close ${label}`}
            aria-label={`Close ${label}`}
        >
            <X size={18}/>
        </button>
    );
}
