import React, {useRef, useEffect} from 'react';
import {User, Users, UserCog, CloudCog, Wallet, LogOut} from 'lucide-react';
import {DEBUG_MODE} from "../../constants/AppConstants";
import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useUIStore} from '@/stores/uiStore';
import {getLogoutUrl} from '../../utils/wsConfig.js';

// User avatar and dropdown menu for profile, logout, etc.
const AvatarMenu = () => {
    const user = useAuthStore(s => s.userInfo);
    const currentTenant = useAuthStore(s => s.currentTenant);
    const setNeedsTenantSelection = useAuthStore(s => s.setNeedsTenantSelection);
    const setCurrentTenant = useAuthStore(s => s.setCurrentTenant);
    const setCurrentWorkspace = useWorkspaceStore(s => s.setCurrentWorkspace);
    const loadApp = useAppPanelStore(s => s.loadApp);
    const avatarMenuOpen = useUIStore(s => s.avatarMenuOpen);
    const toggleAvatarMenu = useUIStore(s => s.toggleAvatarMenu);
    const closeAllDropdowns = useUIStore(s => s.closeAllDropdowns);
    // const toggleSidebar = useUIStore(s => s.toggleSidebar);

    const avatarRef = useRef(null);
    const tenantName = currentTenant?.name;
    // noinspection JSUnresolvedReference
    const isTenantAdmin = user?.permissions?.isTenantAdmin;
    const isAnyAdmin = !!(user?.permissions?.isTenantAdmin || user?.permissions?.isSuperAdmin);

    const menuItems = [
        {
            label: 'Switch Tenant', icon: <Users size={18}/>,
            action: () => {
                // Disconnect current websocket and redirect to tenant selection
                setNeedsTenantSelection(true);
                setCurrentTenant(null);
                // Reset current workspace and app state
                setCurrentWorkspace(null);
                // Redirect to base URL to trigger tenant selection
                window.location.assign('/');
            },
            enabled: () => {
                return user?.tenants && user.tenants.length > 1
            },
        },
        {
            label: 'Settings and Profile', icon: <UserCog size={18}/>,
            action: () => DEBUG_MODE && console.log('Profile action'),
            enabled: () => {
                return false;
            },
        },
        {
            label: 'Billing and Usage', icon: <Wallet size={18}/>,
            action: () => {
                setCurrentWorkspace("_tenant");
                loadApp({id: "admin-console", type: "admin-console"}, {appPath: "billing/usage"});
                // toggleSidebar();
            },
            enabled: () => {
                return isTenantAdmin;
            },
        },
        {
            label: 'Tenant Admin', icon: <CloudCog size={18}/>,
            action: () => {
                setCurrentWorkspace("_tenant");
                loadApp({id: "admin-console", type: "admin-console"});
            },
            enabled: () => isAnyAdmin,
        },
        {
            label: 'Logout', icon: <LogOut size={18}/>,
            action: () => {
                setCurrentWorkspace(null); // Reset workspace
                const logoutForm = document.createElement('form');
                logoutForm.method = 'POST';
                logoutForm.action = getLogoutUrl();
                logoutForm.style.display = 'none';
                document.body.appendChild(logoutForm);
                logoutForm.submit();
            },
            enabled: () => {
                return true;
            },
        },
    ];

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (avatarRef.current && !avatarRef.current.contains(event.target) && avatarMenuOpen) {
                closeAllDropdowns();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [avatarMenuOpen, closeAllDropdowns]);

    const userName = user?.name || "User Name"; // Example from auth context

    return (
        <div className="relative" ref={avatarRef}>
            <button
                onClick={() => toggleAvatarMenu()}
                className="w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                title="User Menu"
                aria-expanded={avatarMenuOpen}
                aria-controls="avatar-menu"
            >
                <User size={22}/>
            </button>
            {avatarMenuOpen && (
                <div
                    id="avatar-menu"
                    className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-xl z-20 border border-gray-200"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="avatar-menu-title"
                >
                    {/* User Info Header */}
                    <div className="px-4 py-3 border-b">
                        <p id="avatar-menu-title"
                           className="text-sm font-medium text-gray-800 truncate">{userName}{isAnyAdmin ? " (Admin)" : ""}</p>
                        {/*<p className="text-xs text-gray-500 truncate">{userEmail}</p>*/}
                        <p className="text-xs text-gray-500 truncate">{tenantName}</p>
                    </div>
                    <div className="py-1">
                        {menuItems.map(item => (
                            item.enabled() && (
                                <button
                                    key={item.label}
                                    onClick={() => {
                                        item.action();
                                        closeAllDropdowns();
                                    }}
                                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none flex items-center transition-colors"
                                >
                                    {React.cloneElement(item.icon, {className: "mr-3 text-gray-500 flex-shrink-0"})}
                                    {item.label}
                                </button>
                            )
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AvatarMenu;
