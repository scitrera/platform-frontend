/**
 * Tool transport types (spec 1.1) — TypeScript types.
 *
 * Mirror of python/src/scitrera_messaging_spec/tools.py. JSON
 * round-trips between Python and TS must be identity; if you change one
 * side, change the other.
 *
 * These are the *transport* types used to actually invoke a tool over
 * Aether's ``TOOL_CALL`` message type. They are NOT content parts — they
 * are not members of the ``ContentPart`` union. The reply to a
 * ``ToolInvokeEnvelope`` is the EXISTING ``ToolResultPart`` from
 * ``schema.ts`` (reused; no new result type is introduced).
 *
 * Versioning: the tool transport layer is introduced at spec 1.1
 * (``TOOLS_SCHEMA_VERSION``). ``ChatMessage``'s wire format is untouched
 * and remains at spec ``MESSAGING_SCHEMA_VERSION = "1.0"``.
 *
 * See docs/UNIVERSAL_MESSAGE_SPEC.md for the normative spec.
 */

import type {MessageAddress} from './schema';

export const TOOLS_SCHEMA_VERSION = '1.1' as const;
export const TOOL_CANCEL_TYPE = 'tool_cancel' as const;
export const TOOL_CANCEL_CAPABILITY = 'tool.cancel.v1' as const;

/**
 * A tool catalog entry.
 *
 * ``tool_describe`` returns the full form; ``tool_search`` may return it
 * with ``input_schema`` omitted.
 *
 * ``kind`` is an open string for forward-compat — same philosophy as the
 * open ``ControlPart.kind`` registry. Documented known values are
 * ``"frontend" | "backend" | "remote" | "office"``.
 */
export interface ToolDescriptor {
    /** Unique catalog key. */
    name: string;
    title?: string | null;
    /** LLM-facing description. */
    description: string;
    /** JSON Schema; present on describe, may be omitted on search. */
    input_schema?: Record<string, unknown> | null;
    /** Open string registry: known values "frontend" | "backend" | "remote" | "office". */
    kind: string;
    /** ``false`` = fire-and-forget. Named ``awaits_result`` (not ``await``) for Python compat. */
    awaits_result: boolean;
    /** Tags for the availability/visibility predicate. */
    toolsets?: string[] | null;
    meta?: Record<string, unknown> | null;
    [extra: string]: unknown;
}

/** Exact immutable tool identity within one live provider generation. */
export interface ToolReference {
    provider_id: string;
    registration_id: string;
    generation: string;
    name: string;
    revision: string;
    [extra: string]: unknown;
}

function canonicalReferenceIdentifier(value: string, field: string): void {
    if (!value || value.trim() !== value || value.includes('\0') || value === '!') {
        throw new Error(`${field} must be a canonical non-sentinel identifier`);
    }
}

export function validateToolReference(ref: ToolReference): void {
    canonicalReferenceIdentifier(ref.provider_id, 'provider_id');
    canonicalReferenceIdentifier(ref.registration_id, 'registration_id');
    canonicalReferenceIdentifier(ref.generation, 'generation');
    canonicalReferenceIdentifier(ref.name, 'name');
    canonicalReferenceIdentifier(ref.revision, 'revision');
}

/**
 * The payload carried as the Aether ``TOOL_CALL`` body (UTF-8 JSON).
 *
 * The reply is the EXISTING ``ToolResultPart`` (reuse it; do not make a
 * new result type).
 *
 * ``addr`` reuses the existing ``MessageAddress``. Per the
 * execution-routing convention, ``request_id`` is the window target and
 * ``task_id`` is the turn's chat task.
 */
export interface ToolInvokeEnvelope {
    schema_version: string;
    /** Correlation id == the tool_call id. */
    call_id: string;
    /** Tool to invoke. */
    name: string;
    /** Exact catalog entry selected during discovery. */
    tool_ref?: ToolReference | null;
    /** Arguments as a record, NOT a JSON string. */
    args: Record<string, unknown>;
    /** Reuses MessageAddress (tenant/workspace/user/thread/app/agent/task/request ids). */
    addr: MessageAddress;
    /** Optional override of the descriptor's default. */
    awaits_result?: boolean | null;
    /** Turn extras with no first-class MessageAddress home (window_id, app_workspace, authority_grant_id). */
    meta?: Record<string, unknown> | null;
    [extra: string]: unknown;
}

export function validateToolInvokeEnvelope(envelope: ToolInvokeEnvelope): void {
    if (envelope.schema_version !== TOOLS_SCHEMA_VERSION) {
        throw new Error(`unsupported tool schema version ${envelope.schema_version}`);
    }
    if (!envelope.call_id.trim()) throw new Error('call_id is required');
    if (!envelope.name.trim()) throw new Error('name is required');
    if (envelope.tool_ref != null) {
        validateToolReference(envelope.tool_ref);
        if (envelope.tool_ref.name !== envelope.name) throw new Error('name must equal tool_ref.name');
    }
}

/** Builder helper — fills spec defaults so callers only pass what they care about. */
export function makeToolInvokeEnvelope(
    input: Partial<ToolInvokeEnvelope> & {call_id: string; name: string},
): ToolInvokeEnvelope {
    return {
        schema_version: TOOLS_SCHEMA_VERSION,
        args: {},
        addr: {},
        meta: null,
        ...input,
    };
}

/** Cancel one in-flight invocation on its exact authenticated host. */
export interface ToolCancelEnvelope {
    schema_version: typeof TOOLS_SCHEMA_VERSION;
    type: typeof TOOL_CANCEL_TYPE;
    call_id: string;
    addr: MessageAddress;
    reason?: string | null;
    meta?: Record<string, unknown> | null;
    [extra: string]: unknown;
}

export function makeToolCancelEnvelope(
    input: Partial<ToolCancelEnvelope> & {call_id: string; addr: MessageAddress},
): ToolCancelEnvelope {
    return {
        schema_version: TOOLS_SCHEMA_VERSION,
        type: TOOL_CANCEL_TYPE,
        ...input,
    };
}

export function validateToolCancelEnvelope(envelope: ToolCancelEnvelope): void {
    if (envelope.schema_version !== TOOLS_SCHEMA_VERSION) {
        throw new Error(`unsupported tool schema version ${envelope.schema_version}`);
    }
    if (envelope.type !== TOOL_CANCEL_TYPE) {
        throw new Error(`unsupported tool transport type ${envelope.type}`);
    }
    if (!envelope.call_id.trim()) throw new Error('call_id is required');
    if (!envelope.addr.task_id?.trim()) throw new Error('addr.task_id is required');
}
