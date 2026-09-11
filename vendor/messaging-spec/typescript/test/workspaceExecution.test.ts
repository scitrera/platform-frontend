import {describe, expect, it} from 'vitest';

import executionBindingFixture from '../../go/testdata/workspace_execution/execution-binding.json';
import toolHostRegistrationFixture from '../../go/testdata/workspace_execution/tool-host-registration.json';

import {
    getExecutionBinding,
    normalizeWorkspaceCapabilities,
    putExecutionBinding,
    validateExecutionBinding,
    validateToolHostRegistration,
    type ChatMessage,
    type ExecutionBinding,
    type ToolHostRegistration,
} from '../src/index';

describe('workspace execution contracts', () => {
    it('round-trips the shared execution binding fixture', () => {
        const binding = structuredClone(executionBindingFixture) as ExecutionBinding;
        const message: ChatMessage = {
            schema_version: '1.0',
            id: 'message-1',
            role: 'user',
            content: [],
            addr: {},
            meta: {},
        };
        putExecutionBinding(message, binding);
        expect(getExecutionBinding(message)).toMatchObject({
            workspace_id: 'ws-project',
            view_id: 'view-worktree-a',
            relative_directory: 'pkg/agent',
            future: 'kept',
        });
    });

    it('validates the shared tool-host fixture', () => {
        const registration = structuredClone(toolHostRegistrationFixture) as ToolHostRegistration;
        expect(() => validateToolHostRegistration(registration)).not.toThrow();
        expect(normalizeWorkspaceCapabilities(registration.views?.[0]?.capabilities)).toEqual([
            'workspace.read',
            'workspace.write',
        ]);
    });

    it('rejects the unpublished tools registration shape', () => {
        const registration = {
            schema_version: '1.0',
            tool_host_id: 'host-a',
            execution_site: 'client',
            tools: [],
        } as unknown as ToolHostRegistration;
        expect(() => validateToolHostRegistration(registration)).toThrow('use catalog_publications');
    });

    it.each(['../../other', '/etc', 'pkg\\local'])('rejects unsafe path %s', (relativeDirectory) => {
        const binding = structuredClone(executionBindingFixture) as ExecutionBinding;
        binding.relative_directory = relativeDirectory;
        expect(() => validateExecutionBinding(binding)).toThrow();
    });
});
