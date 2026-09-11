import React from 'react';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';
import AppArea from '../Apps/AppArea.jsx';
import ChatRail from '../Chat/ChatRail.tsx';
import SelectTenantPrompt from '../Auth/SelectTenantPrompt.jsx';
import AccessDeniedPrompt from '../Auth/AccessDeniedPrompt.jsx';
import PoweredByScitrera from './PoweredByScitrera.jsx';
import {useAuthStore} from '@/stores/authStore';
import useURLSync from '@/hooks/useURLSync';
import useAppEffects from '@/hooks/useAppEffects.jsx';
import useAgentTools from '@/hooks/useAgentTools';

// The main layout component that arranges Sidebar, Header, and AppArea.
const Layout = () => {
    // Activate URL synchronization based on store state.
    useURLSync();
    // Run app-wide effects that used to live inside AppStateProvider.
    useAppEffects();
    // Register the agent→frontend tool suite (AGENT.TOOL_CALL handlers).
    useAgentTools();

    const isAuthenticated = useAuthStore(s => s.isAuthenticated);
    const needsTenantSelection = useAuthStore(s => s.needsTenantSelection);
    const availableTenants = useAuthStore(s => s.availableTenants);
    const setCurrentTenant = useAuthStore(s => s.setCurrentTenant);
    const accessDenied = useAuthStore(s => s.accessDenied);

    const handleTenantSelect = (selectedTenant) => {
        setCurrentTenant(selectedTenant);
        // Update URL to include tenant ID
        window.location.href = `/${selectedTenant.id}`;
    };

    // Authorization failure outranks tenant selection: when the account has no
    // access there is nothing to select, and rendering the app shell would leave
    // the user watching a WebSocket reconnect forever with no explanation.
    if (isAuthenticated && accessDenied) {
        return (
            <>
                <AccessDeniedPrompt denial={accessDenied}/>
                <PoweredByScitrera/>
            </>
        );
    }

    // Show tenant selection screen if needed
    if (isAuthenticated && needsTenantSelection) {
        return (
            <>
                <SelectTenantPrompt
                    tenants={availableTenants}
                    onTenantSelect={handleTenantSelect}
                />
                <PoweredByScitrera/>
            </>
        );
    }

    return (
        <div className="flex h-screen overflow-hidden bg-theme-page-bg">
            {/* Only render Sidebar if user is authenticated */}
            {isAuthenticated && <Sidebar/>}
            <div
                className="flex-grow flex flex-col overflow-hidden min-w-0 min-h-0"> {/* Ensures this area takes remaining space and handles overflow */}
                <Header/>
                <div className="flex-grow flex flex-row overflow-hidden min-w-0 min-h-0 relative">
                    <AppArea/>
                    {isAuthenticated && <ChatRail/>}
                </div>
            </div>
            <PoweredByScitrera/>
        </div>
    );
};

export default Layout;
