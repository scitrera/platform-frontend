import {EmptyState} from '../_shared/EmptyState';

export function AgentsSection() {
    return (
        <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">Agents</h2>
            <EmptyState
                title="Agent management not yet implemented"
                description="Configure agent implementations, launch profiles, and per-tenant defaults."
            />
        </div>
    );
}
