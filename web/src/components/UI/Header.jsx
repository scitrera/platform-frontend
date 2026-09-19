import React from 'react';
import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import BackgroundTasks from './BackgroundTasks.jsx';
import AppsLauncher from '../Apps/AppsLauncher.jsx';
import AvatarMenu from './AvatarMenu.jsx';
import ConnectionStatusIcon from './ConnectionStatusIcon.jsx';
import {ThemeToggle} from '@/components/ui/theme-toggle';
// import logo from '/logo2.png?url';

// Header component displaying workspace title and top-right controls.
const Header = () => {
    const isAuthenticated = useAuthStore(s => s.isAuthenticated);
    const currentTenant = useAuthStore(s => s.currentTenant);
    const uiConfig = useAuthStore(s => s.uiConfig);
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const currentWorkspaceInfo = useWorkspaceStore(s => s.currentWorkspaceInfo);

    // Use useMemo to ensure re-render when currentWorkspaceInfo changes
    const workspaceTitle = currentWorkspaceInfo?.label || currentTenant?.name || "scitrera.ai";
    const tenantLogo = currentTenant?.logo || "/logo2.png";
    const logoOwner = currentTenant?.logo ? currentTenant.name : "scitrera.ai";
    const showLogo = true; // !isCustomSidebarReady;

    return (
        <header className="h-16 bg-theme-header-bg border-b border-theme-header-border flex items-center justify-between px-6 flex-shrink-0">
            <h1 className="text-xl font-semibold text-theme-header-text truncate flex items-center gap-3" title={workspaceTitle}>
                {showLogo &&
                    <img src={tenantLogo} alt={`${logoOwner} Logo`} className="h-8 w-auto"/>
                }
                {isAuthenticated ? workspaceTitle : "scitrera.ai"}
            </h1>
            <div className="flex items-center space-x-3">
                {isAuthenticated && currentWorkspaceId && (
                    <>
                        {uiConfig.showAppsLauncher && <AppsLauncher/>}
                        {uiConfig.showBackgroundTasks && <BackgroundTasks/>}
                    </>
                )}
                <ConnectionStatusIcon/>
                {uiConfig.showThemeToggle !== false && <ThemeToggle/>}
                {/* Only show AvatarMenu when authenticated */}
                {isAuthenticated && <AvatarMenu/>}
            </div>
        </header>
    );
};

export default Header;
