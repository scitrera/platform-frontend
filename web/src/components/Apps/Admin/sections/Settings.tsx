import {EmptyState} from '../_shared/EmptyState';

export function SettingsSection() {
    return (
        <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">Settings</h2>
            <EmptyState
                title="Tenant settings not yet implemented"
                description="Configure tenant-wide defaults, branding, and feature flags."
            />
        </div>
    );
}
