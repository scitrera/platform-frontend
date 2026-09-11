import React from 'react';
import { Settings } from 'lucide-react';

// Component to display a section of workspaces (e.g., Shared or Private).
// A gear (settings) button appears on hover for workspaces the user administers
// (ws.role === 'admin' — always true for private workspaces); clicking it opens
// the workspace settings page via onSettings.
const WorkspacesList = ({title, icon, workspaces, onSelect, currentWorkspaceId, onSettings}) => {
    return (
        <section aria-labelledby={`${title.toLowerCase().replace(' ', '-')}-heading`}>
            <h2
                id={`${title.toLowerCase().replace(' ', '-')}-heading`}
                className="text-sm font-semibold text-gray-500 mb-2 flex items-center"
            >
                {icon} {title}
            </h2>
            {workspaces.length === 0 ? (
                <p className="text-xs text-gray-400 italic px-2">No {title.toLowerCase()} found.</p>
            ) : (
                <ul className="space-y-1">
                    {workspaces.map(ws => (
                        <li key={ws.id} className="group">
                            <div
                                className={`w-full flex items-center justify-between p-2 rounded-md text-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors cursor-pointer ${
                                    ws.id === currentWorkspaceId ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700'
                                }`}
                                onClick={() => onSelect(ws.id)}
                                aria-current={ws.id === currentWorkspaceId ? "page" : undefined}
                            >
                                <span className="truncate">{ws.label}</span>
                                {onSettings && ws.role === 'admin' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSettings(ws.id);
                                        }}
                                        className="ml-1 p-1 shrink-0 text-gray-400 hover:text-blue-600 rounded opacity-40 group-hover:opacity-100 transition-opacity transition-colors"
                                        aria-label={`Settings for ${ws.label}`}
                                        title={`${ws.label} settings`}
                                    >
                                        <Settings size={14} />
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default WorkspacesList;
