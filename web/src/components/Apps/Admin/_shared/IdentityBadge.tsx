/**
 * Small inline badges for principal-type display in admin tables.
 * Style mirrors the OBO badge pattern in AuditLog.tsx for visual consistency.
 */

interface BadgeProps {
    title?: string;
}

export function UserBadge({title}: BadgeProps) {
    return (
        <span
            className="mr-1 inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 align-middle"
            title={title || 'User principal'}
        >
            USER
        </span>
    );
}

export function AgentBadge({title}: BadgeProps) {
    return (
        <span
            className="mr-1 inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-800 align-middle"
            title={title || 'Agent principal'}
        >
            AGENT
        </span>
    );
}

/** Marks UI items only visible to super-admins. */
export function SuperBadge({title}: BadgeProps) {
    return (
        <span
            className="mr-1 inline-flex items-center rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-800 align-middle"
            title={title || 'Visible to super-admins only'}
        >
            SUPER
        </span>
    );
}

/** Parse "us::email@example.com::win-id" → {email, window}. Returns null when not a user identity. */
export function parseUserIdentity(identity: string): { email: string; window: string } | null {
    if (!identity || !identity.startsWith('us::')) return null;
    const rest = identity.slice(4);
    const parts = rest.split('::');
    return {email: parts[0] || '', window: parts.slice(1).join('::')};
}
