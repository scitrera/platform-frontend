import {afterEach, describe, expect, it, vi} from 'vitest';

import {
    invokeAgentTool,
    listRegisteredAgentTools,
    nextAgentToolCatalogSnapshot,
    registerAgentTool,
    subscribeAgentToolRegistry,
    unregisterAgentTool,
} from './agentToolRegistry';

const registered: string[] = [];

function register(name: string) {
    const handler = vi.fn(async (args) => ({name, args}));
    registerAgentTool({
        descriptor: {
            name,
            description: `Invoke ${name}`,
            input_schema: {type: 'object'},
            kind: 'remote',
            awaits_result: true,
            toolsets: ['frontend', 'web'],
        },
        effect: 'interaction',
        handler,
    });
    registered.push(name);
    return handler;
}

afterEach(() => {
    for (const name of registered.splice(0)) unregisterAgentTool(name);
});

describe('browser agent tool registry', () => {
    it('publishes deterministic sorted definitions with monotonic sequence', () => {
        register('frontend_z_tool');
        register('frontend_a_tool');

        const first = nextAgentToolCatalogSnapshot();
        const second = nextAgentToolCatalogSnapshot();

        expect(first.tools.map(tool => tool.descriptor.name)).toEqual([
            'frontend_a_tool',
            'frontend_z_tool',
        ]);
        expect(second.generation).toBe(first.generation);
        expect(second.sequence).toBe(first.sequence + 1);
        expect(second.tools.every(tool => tool.effect === 'interaction')).toBe(true);
    });

    it('invokes the handler associated with the canonical descriptor name', async () => {
        const handler = register('frontend_show_toast');
        await expect(invokeAgentTool('frontend_show_toast', {message: 'hi'})).resolves.toEqual({
            name: 'frontend_show_toast',
            args: {message: 'hi'},
        });
        expect(handler).toHaveBeenCalledWith({message: 'hi'});
        expect(listRegisteredAgentTools()).toEqual(['frontend_show_toast']);
    });

    it('notifies catalog publishers when a component adds or removes a handler', () => {
        const changed = vi.fn();
        const unsubscribe = subscribeAgentToolRegistry(changed);
        register('frontend_dynamic_tool');
        unregisterAgentTool('frontend_dynamic_tool');
        unsubscribe();

        expect(changed).toHaveBeenCalledTimes(2);
    });
});
