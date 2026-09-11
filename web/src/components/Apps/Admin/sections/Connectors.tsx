import {EmptyState} from '../_shared/EmptyState';

export function ConnectorsSection() {
    return (
        <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">Connectors</h2>
            <EmptyState
                title="Connector management not yet implemented"
                description="Manage data-provider connectors, credentials, and sync schedules."
            />
        </div>
    );
}
