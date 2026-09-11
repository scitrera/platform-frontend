/**
 * Agent → frontend tool registry.
 *
 * A module-level singleton Map that holds named handlers for tools the
 * backend supervisor agent can invoke via the WebSocket AGENT.TOOL_CALL
 * channel. Handlers are async-compatible; their return value is shipped
 * back over AGENT.TOOL_RESULT when the agent provided a callId.
 *
 * Use `registerAgentTool` from a hook (e.g., `useAgentTools`) inside a
 * component that has access to the relevant state — most defaults live
 * in `useAgentTools()` mounted from `Layout.jsx`, but any component can
 * register additional tools to expose its own capabilities.
 */

export type AgentToolArgs = Record<string, unknown>;
export type AgentToolHandler = (args: AgentToolArgs) => Promise<unknown> | unknown;
export type AgentToolEffect = 'read' | 'write' | 'execute' | 'external' | 'interaction';

export interface AgentToolDescriptor {
    name: string;
    title?: string;
    description: string;
    input_schema: Record<string, unknown>;
    kind: 'remote';
    awaits_result: true;
    toolsets: string[];
}

export interface AgentToolDefinition {
    descriptor: AgentToolDescriptor;
    effect: AgentToolEffect;
    handler: AgentToolHandler;
}

export interface AgentToolCatalogSnapshot {
    generation: string;
    sequence: number;
    tools: Array<{
        descriptor: AgentToolDescriptor;
        effect: AgentToolEffect;
    }>;
}

const registry = new Map<string, AgentToolDefinition>();
const listeners = new Set<() => void>();
const catalogGeneration = (
    globalThis.crypto?.randomUUID?.()
    ?? `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
);
let catalogSequence = 0;

export function registerAgentTool(definition: AgentToolDefinition): void {
    const name = definition.descriptor.name;
    if (!name) throw new Error('registerAgentTool: descriptor.name is required');
    if (!definition.descriptor.description.trim()) {
        throw new Error(`registerAgentTool: ${name} requires a description`);
    }
    registry.set(name, definition);
    notifyRegistryChanged();
}

export function unregisterAgentTool(name: string): void {
    if (registry.delete(name)) notifyRegistryChanged();
}

export function listRegisteredAgentTools(): string[] {
    return Array.from(registry.keys()).sort();
}

/**
 * Return the next full browser-owned catalog snapshot. The backend binds this
 * non-authoritative definition list to the authenticated user/window route and
 * derives canonical refs, workspace context, lease, and Aether access resource.
 */
export function nextAgentToolCatalogSnapshot(): AgentToolCatalogSnapshot {
    catalogSequence += 1;
    return {
        generation: catalogGeneration,
        sequence: catalogSequence,
        tools: Array.from(registry.values())
            .sort((a, b) => a.descriptor.name.localeCompare(b.descriptor.name))
            .map(({descriptor, effect}) => ({descriptor, effect})),
    };
}

export function subscribeAgentToolRegistry(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notifyRegistryChanged(): void {
    for (const listener of listeners) listener();
}

/**
 * Look up and invoke a registered tool. Throws if the tool isn't
 * registered; otherwise returns whatever the handler returns (awaited
 * if the handler is async).
 */
export async function invokeAgentTool(name: string, args: AgentToolArgs = {}): Promise<unknown> {
    const definition = registry.get(name);
    if (!definition) {
        throw new Error(`Unknown agent tool: ${name}`);
    }
    return await definition.handler(args);
}
