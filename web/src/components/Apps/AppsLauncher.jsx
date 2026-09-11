import React, {useRef, useEffect} from 'react';
import AppsList from './AppsList.jsx';
import {LayoutGrid} from 'lucide-react';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useUIStore} from '@/stores/uiStore';

// Component for launching different applications into the main app area.
const AppsLauncher = () => {
    const availableApps = useWorkspaceStore(s => s.availableApps);
    const loadApp = useAppPanelStore(s => s.loadApp);
    const appsLauncherOpen = useUIStore(s => s.appsLauncherOpen);
    const toggleAppsLauncher = useUIStore(s => s.toggleAppsLauncher);
    const closeAllDropdowns = useUIStore(s => s.closeAllDropdowns);

    const launcherRef = useRef(null);

    const handleLoadApp = (app) => {
        const payload = {id: app.id, title: app.name, mode: app.mode, type: app.type || app.id};

        // Include iframe URL if this is an iframe-based app
        if (app.iframe) {
            payload.iframe = app.iframe;
        }

        loadApp(payload);
        // Close the apps launcher dropdown after loading an app
        closeAllDropdowns();
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (launcherRef.current && !launcherRef.current.contains(event.target) && appsLauncherOpen) {
                closeAllDropdowns();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [appsLauncherOpen, closeAllDropdowns]);


    return (
        <div className="relative" ref={launcherRef}>
            {(availableApps || []).filter(app => !app.id.startsWith('_')).length > 0 && (
                <button
                    onClick={() => toggleAppsLauncher()}
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    title="Launch Apps"
                    aria-expanded={appsLauncherOpen}
                    aria-controls="apps-launcher-menu"
                >
                    <LayoutGrid size={22}/>
                </button>
            )}
            {appsLauncherOpen && (
                <div
                    id="apps-launcher-menu"
                    className="absolute right-0 mt-2 w-72 bg-white rounded-md shadow-xl z-20 border border-gray-200"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="apps-launcher-title"
                >
                    <h3 id="apps-launcher-title" className="p-3 border-b font-semibold text-sm text-gray-700">
                        Applications
                    </h3>
                    <div className="py-1 max-h-80 overflow-y-auto">
                        <AppsList
                            onAppSelect={handleLoadApp}
                            iconSize={18}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default AppsLauncher;
