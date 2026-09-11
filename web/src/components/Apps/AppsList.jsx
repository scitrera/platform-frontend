import React from 'react';
import LazyLucideIcon from '../UI/LazyLucideIcon.jsx';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';

/**
 * AppsList - A reusable list component for displaying available applications
 *
 * Props:
 * - iconSize: Size of the app icons (default: 18)
 * - showIcons: Whether to show app icons (default: true)
 * - spacing: List item spacing (default: 'space-y-0')
 * - onAppSelect: Custom callback when an app is selected (optional)
 * - className: Additional CSS classes for the container
 * - itemClassName: Additional CSS classes for list items (can be string or function that receives (app, mainAppId))
 * - filterApps: Custom function to filter apps (optional, defaults to filtering out apps starting with '_')
 * - apps: Custom apps array (optional, defaults to workspaceStore.availableApps)
 */
const AppsList = ({
                      iconSize = 18,
                      showIcons = true,
                      spacing = 'space-y-0',
                      onAppSelect,
                      className = '',
                      itemClassName = '',
                      filterApps,
                      apps
                  }) => {
    const availableApps = useWorkspaceStore(s => s.availableApps);
    const mainAppId = useAppPanelStore(s => s.main?.id ?? null);
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

    if (filteredApps.length === 0) {
        return (
            <div className={`text-center text-gray-500 text-sm ${className}`}>
                No applications available
            </div>
        );
    }

    return (
        <div className={`${spacing} ${className}`}>
            {filteredApps.map(app => {
                // Support itemClassName as either string or function
                // Function signature preserves legacy callers that expected state:
                // we emulate minimal state shape with just the panel main id.
                const dynamicItemClassName = typeof itemClassName === 'function'
                    ? itemClassName(app, {appPanels: {main: {id: mainAppId}}})
                    : itemClassName;

                return (
                    <button
                        key={app.id}
                        onClick={() => handleAppSelect(app)}
                        className={`w-full text-left px-4 py-2.5 text-md text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none flex items-center transition-colors ${dynamicItemClassName}`}
                    >
                        {showIcons && (
                            <LazyLucideIcon
                                iconName={app.icon}
                                size={iconSize}
                                className="mr-3 text-gray-500 flex-shrink-0"
                            />
                        )}
                        <span className="truncate">{app.name}</span>
                    </button>
                );
            })}
        </div>
    );
};

export default AppsList;
