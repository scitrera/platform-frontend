import {EmptyState} from '../_shared/EmptyState';

export function OverviewSection() {
    return (
        <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">Overview</h2>
            <EmptyState
                title="Overview not yet implemented"
                description="Tenant-wide health, usage, and recent activity will live here."
            />
        </div>
    );
}
