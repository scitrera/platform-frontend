import {EmptyState} from '../_shared/EmptyState';

export function UsersSection() {
    return (
        <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">Users</h2>
            <EmptyState
                title="User management not yet implemented"
                description="View tenant users, manage roles, and audit recent activity."
            />
        </div>
    );
}
