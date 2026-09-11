/** Workspace-view and live tool-host execution contracts. */

import type {ChatMessage} from './schema';
import {validateToolCatalogPublication, type ToolCatalogPublication} from './catalog';

export const WORKSPACE_EXECUTION_SCHEMA_VERSION = '1.0' as const;
export const EXECUTION_BINDING_META_KEY = 'scitrera.execution_binding' as const;

export type ExecutionSite = 'client' | 'worker' | 'remote';
export type WorkspaceViewKind = 'directory' | 'git_worktree' | 'checkout' | 'snapshot' | 'overlay';

export interface WorkspaceViewDescriptor {
    workspace_id: string;
    view_id: string;
    kind: WorkspaceViewKind;
    display_name?: string | null;
    memory_context_id?: string | null;
    revision?: string | null;
    capabilities?: string[] | null;
    meta?: Record<string, unknown> | null;
    [extra: string]: unknown;
}

export interface ExecutionBinding {
    schema_version: string;
    workspace_id: string;
    view_id: string;
    tool_host_id: string;
    execution_site: ExecutionSite;
    root_ref?: string | null;
    relative_directory?: string | null;
    revision?: string | null;
    [extra: string]: unknown;
}

export interface ToolHostRegistration {
    schema_version: string;
    tool_host_id: string;
    execution_site: ExecutionSite;
    views?: WorkspaceViewDescriptor[] | null;
    catalog_publications?: ToolCatalogPublication[] | null;
    meta?: Record<string, unknown> | null;
    [extra: string]: unknown;
}

export function normalizeWorkspaceRelativeDirectory(value?: string | null): string {
    const raw = (value ?? '').trim();
    if (raw === '' || raw === '.') return '';
    if (raw.includes('\0') || raw.includes('\\') || raw.startsWith('/')) {
        throw new Error('relative_directory must be a portable workspace-relative path');
    }
    const parts: string[] = [];
    for (const part of raw.split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..') {
            if (parts.length === 0) throw new Error('relative_directory must not escape the workspace root');
            parts.pop();
        } else {
            parts.push(part);
        }
    }
    return parts.join('/');
}

export function normalizeWorkspaceCapabilities(values?: string[] | null): string[] {
    return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function required(value: string, field: string): void {
    if (!value || !value.trim()) throw new Error(`${field} is required`);
}

function validateExecutionSite(value: string): asserts value is ExecutionSite {
    if (!['client', 'worker', 'remote'].includes(value)) throw new Error(`unsupported execution site ${value}`);
}

export function validateWorkspaceViewDescriptor(view: WorkspaceViewDescriptor): void {
    required(view.workspace_id, 'workspace_id');
    required(view.view_id, 'view_id');
    if (!['directory', 'git_worktree', 'checkout', 'snapshot', 'overlay'].includes(view.kind)) {
        throw new Error(`unsupported workspace view kind ${view.kind}`);
    }
}

export function validateExecutionBinding(binding: ExecutionBinding): void {
    if (binding.schema_version !== WORKSPACE_EXECUTION_SCHEMA_VERSION) {
        throw new Error(`unsupported workspace execution schema version ${binding.schema_version}`);
    }
    required(binding.workspace_id, 'workspace_id');
    required(binding.view_id, 'view_id');
    required(binding.tool_host_id, 'tool_host_id');
    validateExecutionSite(binding.execution_site);
    normalizeWorkspaceRelativeDirectory(binding.relative_directory);
}

export function validateToolHostRegistration(registration: ToolHostRegistration): void {
    if (registration.schema_version !== WORKSPACE_EXECUTION_SCHEMA_VERSION) {
        throw new Error(`unsupported workspace execution schema version ${registration.schema_version}`);
    }
    required(registration.tool_host_id, 'tool_host_id');
    validateExecutionSite(registration.execution_site);
    if ('tools' in registration) throw new Error('tools is unsupported; use catalog_publications');
    const views = new Set<string>();
    for (const view of registration.views ?? []) {
        validateWorkspaceViewDescriptor(view);
        const key = `${view.workspace_id}\0${view.view_id}`;
        if (views.has(key)) throw new Error(`duplicate workspace view ${view.workspace_id}/${view.view_id}`);
        views.add(key);
    }
    const publications = new Set<string>();
    for (const publication of registration.catalog_publications ?? []) {
        validateToolCatalogPublication(publication);
        if (publication.context.tool_host_id !== registration.tool_host_id) {
            throw new Error('catalog publication context.tool_host_id must equal tool_host_id');
        }
        if (publication.context.view_id) {
            const viewKey = `${publication.context.workspace_id ?? ''}\0${publication.context.view_id}`;
            if (!views.has(viewKey)) throw new Error('catalog publication selects an unregistered workspace view');
        }
        const key = `${publication.provider_id}\0${publication.registration_id}`;
        if (publications.has(key)) throw new Error('duplicate catalog publication');
        publications.add(key);
    }
}

export function putExecutionBinding(message: ChatMessage, binding: ExecutionBinding): void {
    validateExecutionBinding(binding);
    message.meta ??= {};
    message.meta[EXECUTION_BINDING_META_KEY] = {
        ...binding,
        relative_directory: normalizeWorkspaceRelativeDirectory(binding.relative_directory),
    };
}

export function getExecutionBinding(message: ChatMessage): ExecutionBinding | undefined {
    const value = message.meta?.[EXECUTION_BINDING_META_KEY];
    if (value == null) return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error('execution binding metadata must be an object');
    const binding = value as ExecutionBinding;
    validateExecutionBinding(binding);
    return binding;
}
