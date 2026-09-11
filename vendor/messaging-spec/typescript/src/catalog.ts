/** Portable, deterministic tool-catalog publication and query contracts. */

import {validateToolReference, type ToolDescriptor, type ToolReference} from './tools';

export const TOOL_CATALOG_SCHEMA_VERSION = '1.0' as const;
export const TOOL_CATALOG_CAPABILITY = 'tool.catalog.v1' as const;
export const TOOL_REFERENCE_CAPABILITY = 'tool.ref.v1' as const;
export const TOOL_CATALOG_MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;

export type ToolEffect = 'read' | 'write' | 'execute' | 'external' | 'interaction';

export interface ToolCatalogContext {
    workspace_id?: string | null;
    thread_id?: string | null;
    view_id?: string | null;
    tool_host_id?: string | null;
    surface_kind?: string | null;
    surface_instance_id?: string | null;
    [extra: string]: unknown;
}

export interface ToolCatalogProvenance {
    source?: string | null;
    host?: string | null;
    meta?: Record<string, unknown> | null;
    [extra: string]: unknown;
}

export interface ToolCatalogEntry {
    ref: ToolReference;
    descriptor: ToolDescriptor;
    effect: ToolEffect;
    provenance?: ToolCatalogProvenance | null;
    [extra: string]: unknown;
}

export interface ToolCatalogPublication {
    schema_version: string;
    provider_id: string;
    registration_id: string;
    generation: string;
    sequence: number;
    lease_expires_at: string;
    context: ToolCatalogContext;
    capabilities?: string[] | null;
    entries: ToolCatalogEntry[];
    meta?: Record<string, unknown> | null;
    [extra: string]: unknown;
}

export interface ToolCatalogRenewRequest {
    schema_version: string;
    provider_id: string;
    registration_id: string;
    generation: string;
    sequence: number;
    lease_expires_at: string;
    [extra: string]: unknown;
}

export interface ToolCatalogRevokeRequest {
    schema_version: string;
    provider_id: string;
    registration_id: string;
    generation: string;
    sequence: number;
    [extra: string]: unknown;
}

export interface ToolCatalogMutationResult {
    schema_version: string;
    provider_id: string;
    registration_id: string;
    generation: string;
    accepted_sequence: number;
    catalog_revision: string;
    [extra: string]: unknown;
}

export interface ToolCatalogQuery {
    schema_version: string;
    context: ToolCatalogContext;
    query?: string | null;
    limit: number;
    cursor?: string | null;
    [extra: string]: unknown;
}

export interface ToolCatalogPage {
    schema_version: string;
    snapshot_id: string;
    catalog_revision: string;
    entries: ToolCatalogEntry[];
    next_cursor?: string | null;
    [extra: string]: unknown;
}

export interface ToolCatalogDescribeRequest {
    schema_version: string;
    context: ToolCatalogContext;
    ref: ToolReference;
    snapshot_id?: string | null;
    [extra: string]: unknown;
}

export interface ToolCatalogDescribeResult {
    schema_version: string;
    snapshot_id: string;
    catalog_revision: string;
    entry: ToolCatalogEntry;
    [extra: string]: unknown;
}

export interface ToolCatalogError {
    schema_version: string;
    code: string;
    message?: string | null;
    restart_required: boolean;
    [extra: string]: unknown;
}

function validateIdentifier(value: string, field: string, required = true): void {
    if (!value) {
        if (required) throw new Error(`${field} is required`);
        return;
    }
    if (value.trim() !== value || value.includes('\0') || value === '!') {
        throw new Error(`${field} must be a canonical non-sentinel identifier`);
    }
}

function validateLabel(value: string | null | undefined, field: string): void {
    if (value != null && (value.trim() !== value || value.includes('\0'))) {
        throw new Error(`${field} must be trimmed and contain no NUL`);
    }
}

function validateTimestamp(value: string, field: string): void {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{0,8}[1-9])?Z$/.exec(value);
    if (match == null) {
        throw new Error(`${field} must be a canonical UTC RFC3339 timestamp`);
    }
    const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
    const [year, month, day, hour, minute, second] = [
        yearText,
        monthText,
        dayText,
        hourText,
        minuteText,
        secondText,
    ].map(Number);
    const parsed = new Date(0);
    parsed.setUTCHours(0, 0, 0, 0);
    parsed.setUTCFullYear(year!, month! - 1, day!);
    parsed.setUTCHours(hour!, minute!, second!, 0);
    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month! - 1 ||
        parsed.getUTCDate() !== day ||
        parsed.getUTCHours() !== hour ||
        parsed.getUTCMinutes() !== minute ||
        parsed.getUTCSeconds() !== second
    ) {
        throw new Error(`${field} must be a canonical UTC RFC3339 timestamp`);
    }
}

function validateSequence(value: number, field = 'sequence'): void {
    if (!Number.isSafeInteger(value) || value <= 0 || value > TOOL_CATALOG_MAX_SEQUENCE) {
        throw new Error(`${field} must be a positive JSON-safe integer`);
    }
}

function validateMutationIdentity(value: {
    schema_version: string;
    provider_id: string;
    registration_id: string;
    generation: string;
}, sequence: number): void {
    if (value.schema_version !== TOOL_CATALOG_SCHEMA_VERSION) {
        throw new Error(`unsupported tool catalog schema version ${value.schema_version}`);
    }
    validateIdentifier(value.provider_id, 'provider_id');
    validateIdentifier(value.registration_id, 'registration_id');
    validateIdentifier(value.generation, 'generation');
    validateSequence(sequence);
}

export function normalizeToolCatalogCapabilities(values?: string[] | null): string[] {
    return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function capabilitiesAreCanonical(values: string[]): boolean {
    const normalized = normalizeToolCatalogCapabilities(values);
    return values.length === normalized.length && values.every((value, index) => value === normalized[index]);
}

export function validateToolCatalogContext(context: ToolCatalogContext): void {
    for (const [field, value] of Object.entries({
        workspace_id: context.workspace_id,
        thread_id: context.thread_id,
        view_id: context.view_id,
        tool_host_id: context.tool_host_id,
        surface_kind: context.surface_kind,
        surface_instance_id: context.surface_instance_id,
    })) {
        if (value != null) validateIdentifier(value, field, false);
    }
    if (context.thread_id && !context.workspace_id) throw new Error('thread_id requires workspace_id');
    if (context.view_id && !context.workspace_id) throw new Error('view_id requires workspace_id');
    if (context.surface_instance_id && !context.surface_kind) {
        throw new Error('surface_instance_id requires surface_kind');
    }
}

export function validateToolCatalogEntry(entry: ToolCatalogEntry): void {
    validateToolReference(entry.ref);
    if (entry.descriptor.name !== entry.ref.name) throw new Error('descriptor.name must equal ref.name');
    validateIdentifier(entry.descriptor.name, 'descriptor.name');
    if (!entry.descriptor.description.trim()) throw new Error('descriptor.description is required');
    if (!entry.descriptor.kind.trim()) throw new Error('descriptor.kind is required');
    if (!['read', 'write', 'execute', 'external', 'interaction'].includes(entry.effect)) {
        throw new Error(`unsupported tool effect ${entry.effect}`);
    }
    if (entry.provenance != null) {
        validateLabel(entry.provenance.source, 'source');
        validateLabel(entry.provenance.host, 'host');
    }
}

export function validateToolCatalogPublication(publication: ToolCatalogPublication): void {
    validateMutationIdentity(publication, publication.sequence);
    validateTimestamp(publication.lease_expires_at, 'lease_expires_at');
    validateToolCatalogContext(publication.context);
    const capabilities = publication.capabilities ?? [];
    if (!capabilitiesAreCanonical(capabilities)) {
        throw new Error('capabilities must be trimmed, unique, and sorted');
    }
    if (publication.entries.length === 0) throw new Error('entries must not be empty');
    let previous = '';
    publication.entries.forEach((entry, index) => {
        validateToolCatalogEntry(entry);
        if (
            entry.ref.provider_id !== publication.provider_id ||
            entry.ref.registration_id !== publication.registration_id ||
            entry.ref.generation !== publication.generation
        ) {
            throw new Error(`entries[${index}].ref must match publication provider/registration/generation`);
        }
        if (index > 0 && entry.ref.name <= previous) {
            throw new Error('entries must have unique names in ascending order');
        }
        previous = entry.ref.name;
    });
}

export function validateToolCatalogRenewRequest(request: ToolCatalogRenewRequest): void {
    validateMutationIdentity(request, request.sequence);
    validateTimestamp(request.lease_expires_at, 'lease_expires_at');
}

export function validateToolCatalogRevokeRequest(request: ToolCatalogRevokeRequest): void {
    validateMutationIdentity(request, request.sequence);
}

export function validateToolCatalogMutationResult(result: ToolCatalogMutationResult): void {
    validateMutationIdentity(result, result.accepted_sequence);
    validateIdentifier(result.catalog_revision, 'catalog_revision');
}

export function validateToolCatalogQuery(query: ToolCatalogQuery): void {
    if (query.schema_version !== TOOL_CATALOG_SCHEMA_VERSION) {
        throw new Error(`unsupported tool catalog schema version ${query.schema_version}`);
    }
    validateToolCatalogContext(query.context);
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) {
        throw new Error('limit must be an integer between 1 and 100');
    }
    validateLabel(query.cursor, 'cursor');
}

function referenceKey(ref: ToolReference): string {
    return [ref.provider_id, ref.registration_id, ref.generation, ref.name, ref.revision].join('\0');
}

export function validateToolCatalogPage(page: ToolCatalogPage): void {
    if (page.schema_version !== TOOL_CATALOG_SCHEMA_VERSION) {
        throw new Error(`unsupported tool catalog schema version ${page.schema_version}`);
    }
    validateIdentifier(page.snapshot_id, 'snapshot_id');
    validateIdentifier(page.catalog_revision, 'catalog_revision');
    validateLabel(page.next_cursor, 'next_cursor');
    let previous = '';
    page.entries.forEach((entry, index) => {
        validateToolCatalogEntry(entry);
        const key = referenceKey(entry.ref);
        if (index > 0 && key <= previous) throw new Error('entries must have unique references in canonical order');
        previous = key;
    });
}

export function validateToolCatalogDescribeRequest(request: ToolCatalogDescribeRequest): void {
    if (request.schema_version !== TOOL_CATALOG_SCHEMA_VERSION) {
        throw new Error(`unsupported tool catalog schema version ${request.schema_version}`);
    }
    validateToolCatalogContext(request.context);
    validateToolReference(request.ref);
    validateLabel(request.snapshot_id, 'snapshot_id');
}

export function validateToolCatalogDescribeResult(result: ToolCatalogDescribeResult): void {
    if (result.schema_version !== TOOL_CATALOG_SCHEMA_VERSION) {
        throw new Error(`unsupported tool catalog schema version ${result.schema_version}`);
    }
    validateIdentifier(result.snapshot_id, 'snapshot_id');
    validateIdentifier(result.catalog_revision, 'catalog_revision');
    validateToolCatalogEntry(result.entry);
}

export function validateToolCatalogError(error: ToolCatalogError): void {
    if (error.schema_version !== TOOL_CATALOG_SCHEMA_VERSION) {
        throw new Error(`unsupported tool catalog schema version ${error.schema_version}`);
    }
    validateIdentifier(error.code, 'code');
}
