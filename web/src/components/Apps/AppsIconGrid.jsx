import React from 'react';
import LazyLucideIcon from '../UI/LazyLucideIcon.jsx';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';

/**
 * AppsIconGrid - A reusable icon grid component for displaying available applications
 *
 * Props:
 * - iconSize: Size of the app icons (default: 32)
 * - gridCols: Number of columns in the grid (default: 4)
 * - showLabels: Whether to show app names below icons (default: true)
 * - spacing: Grid spacing (default: 'gap-4')
 * - onAppSelect: Custom callback when an app is selected (optional)
 * - className: Additional CSS classes for the container
 * - filterApps: Custom function to filter apps (optional, defaults to filtering out apps starting with '_')
 * - apps: Custom apps array (optional, defaults to workspaceStore.availableApps)
 */
const AppsIconGrid = ({
    iconSize = 32,
    gridCols = 4,
    showLabels = true,
    spacing = 'gap-4',
    onAppSelect,
    className = '',
    filterApps,
    apps
}) => {
    const availableApps = useWorkspaceStore(s => s.availableApps);
    const loadApp = useAppPanelStore(s => s.loadApp);

    const handleAppSelect = (app) => {
        // If a custom callback is provided, use it
        if (onAppSelect) {
            onAppSelect(app);
            return;
        }

        // Default behavior: load the app
        const payload = {id: app.id, title: app.name, mode: app.mode, type: app.type || app.id};

        // Include iframe URL if this is an iframe-based app
        if (app.iframe) {
            payload.iframe = app.iframe;
        }

        loadApp(payload);
    };

    // Default filter function - can be overridden by props
    const defaultFilterApps = (apps) =>
        apps.filter(app => !app.id.startsWith('_'));

    // Use custom apps array if provided, otherwise use store availableApps
    const effectiveApps = apps || availableApps || [];

    // Use custom filter function if provided, otherwise use default
    const filterFunction = filterApps || defaultFilterApps;
    const filteredApps = filterFunction(effectiveApps);

    // Generate grid columns class dynamically
    const gridColsClass = {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-4',
        5: 'grid-cols-5',
        6: 'grid-cols-6',
        7: 'grid-cols-7',
        8: 'grid-cols-8'
    }[gridCols] || 'grid-cols-4';

    if (filteredApps.length === 0) {
        return (
            <div className={`text-center text-gray-500 text-sm ${className}`}>
                No applications available
            </div>
        );
    }

    return (
        <div className={`grid ${gridColsClass} ${spacing} ${className}`}>
            {filteredApps.map(app => (
                <button
                    key={app.id}
                    onClick={() => handleAppSelect(app)}
                    className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
                    title={app.name}
                >
                    <div className="flex items-center justify-center mb-2">
                        <LazyLucideIcon
                            iconName={app.icon}
                            size={iconSize}
                            className="text-gray-600 flex-shrink-0"
                        />
                    </div>
                    {showLabels && (
                        <span className="text-xs text-gray-700 text-center leading-tight max-w-full truncate">
                            {app.name}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
};

export default AppsIconGrid;
