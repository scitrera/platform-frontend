import {useEffect, useMemo, useContext} from 'react';
import {useAuthStore} from '@/stores/authStore';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {WebSocketContext} from '@/contexts/WebSocketContext';
import {parseUrlPath} from '@/utils/urlUtils.js';
import {AuthorityBadge} from './_shared/AuthorityBadge';
import {ConnectionsSection} from './sections/Connections';
import {AuditLogSection} from './sections/AuditLog';
import {OverviewSection} from './sections/Overview';
import {AgentsSection} from './sections/Agents';
import {InvoicesSection, TrendsSection, UsageSection} from './sections/Billing';
import {ConnectorsSection} from './sections/Connectors';
import {MCPServersSection} from './sections/MCPServers';
import {UsersSection} from './sections/Users';
import {SettingsSection} from './sections/Settings';
import {MemoryLayerOverviewSection} from './sections/MemoryLayerOverview';
import {MemoryLayerWorkspacesSection} from './sections/MemoryLayerWorkspaces';
import {MemoryLayerSessionsSection} from './sections/MemoryLayerSessions';
import {MemoryLayerMemoriesSection} from './sections/MemoryLayerMemories';
import {MemoryLayerDocumentsSection} from './sections/MemoryLayerDocuments';
import {MemoryLayerDatasetsSection} from './sections/MemoryLayerDatasets';
import {MemoryLayerEntitiesSection} from './sections/MemoryLayerEntities';
import {MemoryLayerJobsSection} from './sections/MemoryLayerJobs';
import {MemoryLayerAuditSection} from './sections/MemoryLayerAudit';
import {MemoryLayerChatsSection} from './sections/MemoryLayerChats';
import {MemoryLayerSkillsSection} from './sections/MemoryLayerSkills';
import {MemoryLayerMCPServersSection} from './sections/MemoryLayerMCPServers';
import {MemoryLayerApplicationsSection} from './sections/MemoryLayerApplications';
import type {Authority, SectionDef} from './types';

const SECTIONS: SectionDef[] = [
    // Tenant group — all sections are scaffolding ("not yet implemented"
    // EmptyState placeholders), so they gate at 'super': super-admins see the
    // scaffold to build against while normal tenant admins only see the working
    // sections below. Flip each back to 'tenant' as it's implemented.
    {id: 'tenant.overview', path: 'tenant/overview', group: 'Tenant', label: 'Overview',
        authority: 'super' as Authority, Component: OverviewSection},
    {id: 'tenant.agents', path: 'tenant/agents', group: 'Tenant', label: 'Agents',
        authority: 'super' as Authority, Component: AgentsSection},
    {id: 'tenant.connectors', path: 'tenant/connectors', group: 'Tenant', label: 'Connectors',
        authority: 'super' as Authority, Component: ConnectorsSection},
    {id: 'tenant.mcp_servers', path: 'tenant/mcp-servers', group: 'Tenant', label: 'MCP Servers',
        authority: 'super' as Authority, Component: MCPServersSection},
    {id: 'tenant.users', path: 'tenant/users', group: 'Tenant', label: 'Users',
        authority: 'super' as Authority, Component: UsersSection},
    {id: 'tenant.settings', path: 'tenant/settings', group: 'Tenant', label: 'Settings',
        authority: 'super' as Authority, Component: SettingsSection},
    // MemoryLayer — placed before Aether per the console's data-centric ordering.
    {id: 'memorylayer.overview', path: 'memorylayer/overview', group: 'MemoryLayer', label: 'Overview',
        authority: 'tenant' as Authority, Component: MemoryLayerOverviewSection},
    {id: 'memorylayer.workspaces', path: 'memorylayer/workspaces', group: 'MemoryLayer', label: 'Workspaces',
        authority: 'tenant' as Authority, Component: MemoryLayerWorkspacesSection},
    {id: 'memorylayer.sessions', path: 'memorylayer/sessions', group: 'MemoryLayer', label: 'Sessions',
        authority: 'super' as Authority, Component: MemoryLayerSessionsSection},
    {id: 'memorylayer.memories', path: 'memorylayer/memories', group: 'MemoryLayer', label: 'Memories',
        authority: 'super' as Authority, Component: MemoryLayerMemoriesSection},
    {id: 'memorylayer.documents', path: 'memorylayer/documents', group: 'MemoryLayer', label: 'Documents',
        authority: 'tenant' as Authority, Component: MemoryLayerDocumentsSection},
    {id: 'memorylayer.datasets', path: 'memorylayer/datasets', group: 'MemoryLayer', label: 'Datasets',
        authority: 'tenant' as Authority, Component: MemoryLayerDatasetsSection},
    {id: 'memorylayer.entities', path: 'memorylayer/entities', group: 'MemoryLayer', label: 'Entities',
        authority: 'super' as Authority, Component: MemoryLayerEntitiesSection},
    {id: 'memorylayer.jobs', path: 'memorylayer/jobs', group: 'MemoryLayer', label: 'Jobs',
        authority: 'tenant' as Authority, Component: MemoryLayerJobsSection},
    {id: 'memorylayer.audit', path: 'memorylayer/audit', group: 'MemoryLayer', label: 'Audit',
        authority: 'tenant' as Authority, Component: MemoryLayerAuditSection},
    // Super-only catalog + chat views. These expose tenant-wide operational
    // data (all users' chat threads; the skill/MCP registry; the app catalog)
    // beyond a tenant admin's remit, so they gate at 'super' (nav "Super" chip).
    {id: 'memorylayer.chats', path: 'memorylayer/chats', group: 'MemoryLayer', label: 'Chats',
        authority: 'super' as Authority, Component: MemoryLayerChatsSection},
    {id: 'memorylayer.skills', path: 'memorylayer/skills', group: 'MemoryLayer', label: 'Skills',
        authority: 'super' as Authority, Component: MemoryLayerSkillsSection},
    {id: 'memorylayer.mcp_servers', path: 'memorylayer/mcp-servers', group: 'MemoryLayer', label: 'MCP Servers',
        authority: 'super' as Authority, Component: MemoryLayerMCPServersSection},
    {id: 'memorylayer.applications', path: 'memorylayer/applications', group: 'MemoryLayer', label: 'Applications',
        authority: 'super' as Authority, Component: MemoryLayerApplicationsSection},
    // Aether — supported public admin operations.
    {id: 'aether.connections', path: 'aether/connections', group: 'Aether', label: 'Connections',
        authority: 'tenant' as Authority, Component: ConnectionsSection},
    {id: 'aether.audit', path: 'aether/audit', group: 'Aether', label: 'Audit Log',
        authority: 'tenant' as Authority, Component: AuditLogSection},
    {id: 'billing.usage',    path: 'billing/usage',    group: 'Billing', label: 'Usage',
        authority: 'tenant' as Authority, Component: UsageSection},
    {id: 'billing.invoices', path: 'billing/invoices', group: 'Billing', label: 'Invoices',
        authority: 'tenant' as Authority, Component: InvoicesSection},
    {id: 'billing.trends',   path: 'billing/trends',   group: 'Billing', label: 'Trends',
        authority: 'tenant' as Authority, Component: TrendsSection},
    // TODO(phase-2): more Aether sections (tasks, agents, KV, ACL, tokens)
    // TODO(phase-4): cross-workspace Sharing
];

function isVisible(section: SectionDef, canTenant: boolean, canSuper: boolean): boolean {
    if (section.authority === 'super') return canSuper;
    if (section.authority === 'tenant') return canTenant || canSuper;
    return false;
}

function findSectionByPath(path: string | null, fallback: SectionDef[]): SectionDef | null {
    if (path) {
        const normalized = path.replace(/^\/+|\/+$/g, '');
        const hit = SECTIONS.find(s => s.path === normalized);
        if (hit) return hit;
    }
    return fallback[0] ?? null;
}

export default function AdminDashboardApp() {
    const userInfo = useAuthStore(s => s.userInfo);
    const ws = useContext(WebSocketContext);
    const sendRpcRequest = ws?.sendRpcRequest;

    const appPath = useAppPanelStore(s => s.appPath);
    const updateAppUrl = useAppPanelStore(s => s.updateAppUrl);

    const canTenant = !!userInfo?.permissions?.isTenantAdmin;
    const canSuper = !!userInfo?.permissions?.isSuperAdmin;

    const visibleSections = useMemo(
        () => SECTIONS.filter(s => isVisible(s, canTenant, canSuper)),
        [canTenant, canSuper],
    );

    const groups = useMemo(() => {
        const out: Record<string, SectionDef[]> = {};
        for (const s of visibleSections) {
            (out[s.group] ||= []).push(s);
        }
        return out;
    }, [visibleSections]);

    // Resolve active section from appPath. Sections the user can't see fall
    // back to the first visible section so we never render a hidden section.
    const activeSection = useMemo(() => {
        const found = findSectionByPath(appPath, visibleSections);
        if (found && !isVisible(found, canTenant, canSuper)) {
            return visibleSections[0] ?? null;
        }
        return found;
    }, [appPath, visibleSections, canTenant, canSuper]);

    // First render: if URL has no path, lock the default section into the URL
    // so a deep link / refresh always reflects the visible section.
    useEffect(() => {
        if (!appPath && activeSection) {
            updateAppUrl({path: activeSection.path, replace: true});
        }
    }, [appPath, activeSection, updateAppUrl]);

    // Browser back/forward: re-sync store from URL. The app's existing
    // useURLSync only writes URL ← state; popstate is the missing inverse.
    // Scoped here (not global) to avoid changing app-wide behavior.
    useEffect(() => {
        const onPopState = () => {
            const {appPath: nextPath, queryParams, hashParams} = parseUrlPath();
            updateAppUrl({
                path: nextPath ?? null,
                query: queryParams ?? null,
                hash: hashParams || null,
                stateOnly: true,
            });
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [updateAppUrl]);

    const onSectionClick = (s: SectionDef) => {
        // Section change: clear filters and drawer state. New history entry.
        updateAppUrl({path: s.path, query: null, hash: null});
    };

    if (!sendRpcRequest) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
                Connecting...
            </div>
        );
    }

    if (visibleSections.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
                You don't have access to any admin sections.
            </div>
        );
    }

    const ActiveComponent = activeSection?.Component ?? null;

    return (
        <div className="flex h-full min-h-0">
            <aside className="w-56 flex-shrink-0 border-r bg-gray-50 overflow-y-auto">
                <div className="p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Admin
                </div>
                {Object.entries(groups).map(([group, sections]) => (
                    <div key={group} className="mb-2">
                        <div className="px-3 py-1 text-xs font-medium text-gray-500">{group}</div>
                        <ul>
                            {sections.map(s => {
                                const active = s.id === activeSection?.id;
                                return (
                                    <li key={s.id}>
                                        <button
                                            className={`w-full text-left px-3 py-2 text-sm flex items-center hover:bg-gray-100 ${active ? 'bg-white font-medium' : 'text-gray-700'}`}
                                            onClick={() => onSectionClick(s)}
                                        >
                                            <span>{s.label}</span>
                                            <AuthorityBadge authority={s.authority}/>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </aside>
            <main className="flex-1 min-w-0 min-h-0 overflow-auto">
                {ActiveComponent ? <ActiveComponent/> : null}
            </main>
        </div>
    );
}
