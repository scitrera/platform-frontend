import React, {useState} from 'react';
import {Search, Loader2} from 'lucide-react';
import AppsList from './AppsList.jsx';
import {useWorkspaceStore} from '@/stores/workspaceStore';

// Sidebar component for navigating applications.
const AppsSidebar = () => {
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const [appSearchTerm, setAppSearchTerm] = useState('');

    const filterApps = (apps) =>
        apps.filter(app => !app.id.startsWith('_') && app.name.toLowerCase().includes(appSearchTerm.toLowerCase()));


    return (
        <>
            <div className="p-4 border-b border-gray-300 flex-shrink-0">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search applications..."
                        className="w-full p-2 pl-8 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={appSearchTerm}
                        onChange={(e) => setAppSearchTerm(e.target.value)}
                        aria-label="Search applications"
                    />
                    <Search size={18} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
                            aria-hidden="true"/>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto p-4">
                {!currentWorkspaceId ? (
                    <div className="text-center text-gray-500 py-10">
                        Please select a workspace to view available applications.
                    </div>
                ) : (
                    <AppsList
                        iconSize={20}
                        filterApps={filterApps}
                        spacing="space-y-2"
                        itemClassName={(app, state) =>
                            `p-3 rounded-md hover:bg-gray-200 ${
                                state.appPanels?.main?.id === app.id ? 'bg-blue-100 text-blue-800' : ''
                            }`
                        }
                        className="text-center text-gray-500 py-5"
                    />
                )}
            </div>
        </>
    );
};

export default AppsSidebar;
