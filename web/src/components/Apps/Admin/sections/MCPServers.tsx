import {EmptyState} from '../_shared/EmptyState';

export function MCPServersSection() {
    return (
        <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">MCP Servers</h2>
            <EmptyState
                title="MCP server management not yet implemented"
                description="Register MCP servers, browse advertised tools, and gate per-workspace access."
            />
        </div>
    );
}
