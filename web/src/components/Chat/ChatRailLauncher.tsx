import {MessageSquare} from 'lucide-react';
import {useChatRailStore} from '@/stores/chatRailStore';

/**
 * COLLAPSED-state right-edge strip. A single button expands the rail
 * back to the persisted SIDEBAR state.
 */
export default function ChatRailLauncher() {
    const expand = useChatRailStore(s => s.expand);

    return (
        <div className="flex-shrink-0 w-10 bg-gray-100 border-l border-gray-200 flex flex-col items-center pt-3">
            <button
                type="button"
                onClick={expand}
                title="Open chat"
                className="p-2 rounded text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors"
            >
                <MessageSquare size={20}/>
            </button>
        </div>
    );
}
