/** Transport-neutral session attach, snapshot, and replay protocol. */

import type {StreamEvent} from './events';
import type {ChatMessage} from './schema';

export const SESSION_PROTOCOL_VERSION = 1 as const;
export const SESSION_SCHEMA_REVISION = 3 as const;
export const SESSION_FRAME_SCHEMA_REVISION = 2 as const;
export const SESSION_LIFECYCLE_STATE_SCHEMA_REVISION = 3 as const;
export const SESSION_MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;

export const SESSION_CAPABILITY_SNAPSHOT = 'session.snapshot.v1';
export const SESSION_CAPABILITY_REPLAY = 'session.replay.v1';
export const SESSION_CAPABILITY_CHUNKED_SNAPSHOT = 'session.snapshot.chunked.v1';
export const SESSION_CAPABILITY_COMMAND_JOURNAL = 'session.command_journal.v1';
export const SESSION_CAPABILITY_MULTI_WORKSPACE = 'session.multi_workspace.v1';
export const SESSION_CAPABILITY_GOALS_STATE = 'session.state.goals.v1';
export const SESSION_CAPABILITY_SUBAGENTS_STATE = 'session.state.subagents.v1';
export const SESSION_STATE_GOALS = SESSION_CAPABILITY_GOALS_STATE;
export const SESSION_STATE_SUBAGENTS = SESSION_CAPABILITY_SUBAGENTS_STATE;

export type SessionCapability = string;
export type SessionEventKind = string;
export const SESSION_EVENT_CHAT_STREAM = 'chat_stream';
export type SessionReplayStatus = 'complete' | 'partial' | 'unavailable';
export type SessionFrameType = string;
export const SESSION_FRAME_ATTACH_REQUEST = 'attach_request';
export const SESSION_FRAME_ATTACH_RESULT = 'attach_result';
export const SESSION_FRAME_EVENT = 'event';
export const SESSION_FRAME_ERROR = 'error';

export type SessionSubagentStatus =
    | 'admitted'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'interrupted'
    | 'deleted';
export type SessionGoalStatus = 'pending' | 'active' | 'completed' | 'blocked' | 'cancelled';

export interface SessionCursor {
    generation: string;
    sequence: number;
    [key: string]: unknown;
}

export interface SessionEvent {
    protocol_version: typeof SESSION_PROTOCOL_VERSION;
    schema_revision: number;
    workspace_id: string;
    session_id: string;
    cursor: SessionCursor;
    kind: SessionEventKind;
    payload: unknown;
    [key: string]: unknown;
}

export interface SessionReplayResult {
    status: SessionReplayStatus;
    events?: SessionEvent[];
    through: SessionCursor;
    [key: string]: unknown;
}

/** Authoritative runtime lifecycle for one child session. */
export interface SessionSubagentRecord {
    id: string;
    parent_session_id: string;
    child_session_id: string;
    task_id?: string;
    name?: string;
    kind?: string;
    model?: string;
    depth: number;
    status: SessionSubagentStatus;
    created_at: string;
    updated_at: string;
    completed_at?: string;
    deleted_at?: string;
    parent_usage?: Record<string, unknown>;
    child_usage?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface SessionSubagentsState {
    schema_revision: 1;
    records: SessionSubagentRecord[];
    [key: string]: unknown;
}

/** Durable goal lifecycle and portable token accounting. */
export interface SessionGoalRecord {
    id: string;
    objective: string;
    status: SessionGoalStatus;
    created_at: string;
    updated_at: string;
    completed_at?: string;
    token_budget?: number;
    token_usage?: number;
    evidence?: string[];
    blocked_reason?: string;
    [key: string]: unknown;
}

export interface SessionGoalsState {
    schema_revision: 1;
    records: SessionGoalRecord[];
    [key: string]: unknown;
}

export interface SessionSnapshot {
    workspace_id: string;
    session_id: string;
    cursor: SessionCursor;
    messages: ChatMessage[];
    state: Record<string, unknown>;
    [key: string]: unknown;
}

export interface SessionAttachRequest {
    protocol_version: typeof SESSION_PROTOCOL_VERSION;
    schema_revision: number;
    workspace_id?: string;
    session_id: string;
    client_id: string;
    capabilities?: SessionCapability[];
    resume_after?: SessionCursor;
    [key: string]: unknown;
}

export interface SessionAttachResult {
    protocol_version: typeof SESSION_PROTOCOL_VERSION;
    schema_revision: number;
    workspace_id: string;
    session_id: string;
    capabilities?: SessionCapability[];
    snapshot: SessionSnapshot;
    replay?: SessionReplayResult;
    [key: string]: unknown;
}

export interface SessionErrorPayload {
    code: string;
    message: string;
    retryable?: boolean;
    [key: string]: unknown;
}

/** One session-protocol payload on a multiplexed message lane. */
export interface SessionFrame {
    protocol_version: typeof SESSION_PROTOCOL_VERSION;
    schema_revision: number;
    type: SessionFrameType;
    request_id?: string;
    payload: unknown;
    [key: string]: unknown;
}

export function defaultSessionCapabilities(): SessionCapability[] {
    return [SESSION_CAPABILITY_REPLAY, SESSION_CAPABILITY_SNAPSHOT];
}

export function normalizeSessionCapabilities(capabilities: Iterable<SessionCapability>): SessionCapability[] {
    return [...new Set([...capabilities].filter((capability) => capability.length > 0))].sort();
}

export function negotiateSessionCapabilities(
    client: Iterable<SessionCapability>,
    server: Iterable<SessionCapability>,
): SessionCapability[] {
    const clientSet = new Set([...client].filter((capability) => capability.length > 0));
    return normalizeSessionCapabilities([...server].filter((capability) => clientSet.has(capability)));
}

export function negotiateSessionSchemaRevision(client: number, server: number): number {
    if (!Number.isInteger(client) || !Number.isInteger(server) || client <= 0 || server <= 0) return 0;
    return Math.min(client, server);
}

/** Compare cursors in one generation. Different generations are incomparable. */
export function compareSessionCursors(left: SessionCursor, right: SessionCursor): -1 | 0 | 1 {
    validateSessionCursor(left);
    validateSessionCursor(right);
    if (left.generation !== right.generation) throw new Error('session cursor generations differ');
    if (left.sequence < right.sequence) return -1;
    if (left.sequence > right.sequence) return 1;
    return 0;
}

/** Validate the portable cursor representation at a JSON boundary. */
export function validateSessionCursor(cursor: SessionCursor): void {
    if (!cursor.generation) throw new Error('session cursor generation is required');
    if (!Number.isSafeInteger(cursor.sequence) || cursor.sequence < 0 || cursor.sequence > SESSION_MAX_SEQUENCE) {
        throw new Error('session cursor sequence must be a non-negative safe integer');
    }
}

function replayEvents(result: SessionReplayResult): SessionEvent[] {
    return result.events ?? [];
}

/** Validate an attach request independently of a correlated result. */
export function validateSessionAttachRequest(request: SessionAttachRequest): void {
    if (request.protocol_version !== SESSION_PROTOCOL_VERSION) throw new Error('unsupported session protocol version');
    if (!Number.isInteger(request.schema_revision) || request.schema_revision <= 0) {
        throw new Error('invalid client session schema revision');
    }
    if (!request.session_id || !request.client_id) throw new Error('session id and client id are required');
    if (request.resume_after) validateSessionCursor(request.resume_after);
}

/** Validate one live event independently of replay coverage. */
export function validateSessionEvent(event: SessionEvent): void {
    if (event.protocol_version !== SESSION_PROTOCOL_VERSION) throw new Error('unsupported session protocol version');
    if (!Number.isInteger(event.schema_revision) || event.schema_revision <= 0) {
        throw new Error('invalid session event schema revision');
    }
    if (!event.workspace_id || !event.session_id || !event.kind) {
        throw new Error('session event is missing identity or kind');
    }
    validateSessionCursor(event.cursor);
    if (event.payload === undefined) throw new Error('session event payload is required');
}

/** Validate replay ordering and coverage against the requested cursor. */
export function validateSessionReplayCoverage(result: SessionReplayResult, after: SessionCursor): void {
    validateSessionCursor(after);
    validateSessionCursor(result.through);
    const events = replayEvents(result);
    if (result.status === 'unavailable') {
        if (events.length > 0) throw new Error('unavailable session replay must not contain events');
        return;
    }
    if (result.through.generation !== after.generation) throw new Error('session cursor generations differ');
    if (after.sequence > result.through.sequence) throw new Error('requested sequence exceeds through sequence');
    if (result.status === 'partial' && events.length === 0) {
        throw new Error('partial session replay must contain a retained suffix');
    }
    if (result.status === 'complete' && events.length === 0 && after.sequence !== result.through.sequence) {
        throw new Error('complete session replay does not cover through cursor');
    }

    let previous = after.sequence;
    events.forEach((event, index) => {
        validateSessionCursor(event.cursor);
        if (event.protocol_version !== SESSION_PROTOCOL_VERSION || !Number.isInteger(event.schema_revision) || event.schema_revision <= 0) {
            throw new Error(`replay event ${index} has an invalid session protocol version or schema revision`);
        }
        if (!event.workspace_id || !event.session_id || !event.kind) {
            throw new Error(`replay event ${index} is missing session identity or kind`);
        }
        if (event.cursor.generation !== after.generation) throw new Error(`replay event ${index} has another generation`);
        if (event.cursor.sequence <= previous) throw new Error(`replay event ${index} is not after the previous event`);
        if (result.status === 'complete' || index > 0) {
            if (event.cursor.sequence !== previous + 1) throw new Error(`replay event ${index} is not contiguous`);
        } else if (event.cursor.sequence === previous + 1) {
            throw new Error('partial session replay does not contain a gap');
        }
        if (event.cursor.sequence > result.through.sequence) throw new Error(`replay event ${index} exceeds through cursor`);
        previous = event.cursor.sequence;
    });
    if (events.length > 0 && previous !== result.through.sequence) {
        throw new Error('session replay ends before through cursor');
    }
}

/** Validate a resolved attach result against its originating request. */
export function validateSessionAttachResult(result: SessionAttachResult, request: SessionAttachRequest): void {
    validateSessionAttachRequest(request);
    if (result.protocol_version !== SESSION_PROTOCOL_VERSION) throw new Error('unsupported session protocol version');
    if (!Number.isInteger(result.schema_revision) || result.schema_revision <= 0 || result.schema_revision > request.schema_revision) {
        throw new Error('invalid negotiated session schema revision');
    }
    if (!result.workspace_id) throw new Error('resolved workspace id is required');
    if (request.workspace_id && result.workspace_id !== request.workspace_id) {
        throw new Error('attach result workspace does not match explicit request');
    }
    if (!result.session_id || result.session_id !== request.session_id) {
        throw new Error('attach result session does not match request');
    }
    const requested = new Set(request.capabilities ?? []);
    const capabilities = result.capabilities ?? [];
    const normalizedCapabilities = normalizeSessionCapabilities(capabilities);
    if (
        capabilities.length !== normalizedCapabilities.length ||
        capabilities.some((value, index) => value !== normalizedCapabilities[index])
    ) {
        throw new Error('negotiated session capabilities are not normalized');
    }
    for (const capability of normalizedCapabilities) {
        if (!requested.has(capability)) throw new Error(`unrequested negotiated capability ${capability}`);
    }
    if (result.snapshot.workspace_id !== result.workspace_id || result.snapshot.session_id !== result.session_id) {
        throw new Error('snapshot identity does not match attach result');
    }
    validateSessionCursor(result.snapshot.cursor);
    validateSessionSnapshotState(result);
    if (!request.resume_after) {
        if (result.replay) throw new Error('replay returned without a resume cursor');
        return;
    }
    if (!result.replay) return;
    if (!(result.capabilities ?? []).includes(SESSION_CAPABILITY_REPLAY)) {
        throw new Error('replay returned without negotiated replay capability');
    }
    validateSessionReplayCoverage(result.replay, request.resume_after);
    if (compareSessionCursors(result.replay.through, result.snapshot.cursor) !== 0) {
        throw new Error('replay and snapshot cursors describe different attach boundaries');
    }
    replayEvents(result.replay).forEach((event, index) => {
        if (event.workspace_id !== result.workspace_id || event.session_id !== result.session_id) {
            throw new Error(`replay event ${index} identity does not match attach result`);
        }
    });
}

function standardStateObject(snapshot: SessionSnapshot, key: string): Record<string, unknown> | undefined {
    const value = snapshot.state?.[key];
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`session state ${key} must be an object`);
    }
    return value as Record<string, unknown>;
}

function validateTimestamp(value: unknown, label: string): void {
    if (typeof value !== 'string' || value.length === 0 || Number.isNaN(Date.parse(value))) {
        throw new Error(`${label} must be an RFC 3339 timestamp`);
    }
}

function validateLexicalIDs(records: Array<{id: string}>, label: string): void {
    let previous = '';
    records.forEach((record) => {
        if (!record.id || (previous && record.id <= previous)) {
            throw new Error(`${label} records must have unique IDs in lexical order`);
        }
        previous = record.id;
    });
}

export function validateSessionSubagentsState(state: SessionSubagentsState, parentSessionID: string): void {
    if (state.schema_revision !== 1 || !Array.isArray(state.records)) {
        throw new Error('unsupported or malformed session subagents state');
    }
    validateLexicalIDs(state.records, 'session subagent');
    const statuses = new Set<SessionSubagentStatus>([
        'admitted',
        'running',
        'completed',
        'failed',
        'cancelled',
        'interrupted',
        'deleted',
    ]);
    state.records.forEach((record, index) => {
        if (!record.parent_session_id || !record.child_session_id || record.parent_session_id !== parentSessionID) {
            throw new Error(`session subagent record ${index} identity does not match snapshot session`);
        }
        if (!Number.isInteger(record.depth) || record.depth < 0 || !statuses.has(record.status)) {
            throw new Error(`session subagent record ${index} has invalid depth or status`);
        }
        validateTimestamp(record.created_at, `session subagent record ${index} created_at`);
        validateTimestamp(record.updated_at, `session subagent record ${index} updated_at`);
        if (['completed', 'failed', 'cancelled', 'interrupted'].includes(record.status) && !record.completed_at) {
            throw new Error(`terminal session subagent record ${index} requires completed_at`);
        }
        if (record.completed_at) validateTimestamp(record.completed_at, `session subagent record ${index} completed_at`);
        if (record.status === 'deleted' && !record.deleted_at) {
            throw new Error(`deleted session subagent record ${index} requires deleted_at`);
        }
        if (record.deleted_at) validateTimestamp(record.deleted_at, `session subagent record ${index} deleted_at`);
    });
}

export function validateSessionGoalsState(state: SessionGoalsState): void {
    if (state.schema_revision !== 1 || !Array.isArray(state.records)) {
        throw new Error('unsupported or malformed session goals state');
    }
    validateLexicalIDs(state.records, 'session goal');
    const statuses = new Set<SessionGoalStatus>(['pending', 'active', 'completed', 'blocked', 'cancelled']);
    state.records.forEach((record, index) => {
        if (!record.objective || !statuses.has(record.status)) {
            throw new Error(`session goal record ${index} has invalid objective or status`);
        }
        validateTimestamp(record.created_at, `session goal record ${index} created_at`);
        validateTimestamp(record.updated_at, `session goal record ${index} updated_at`);
        if (['completed', 'cancelled'].includes(record.status) && !record.completed_at) {
            throw new Error(`terminal session goal record ${index} requires completed_at`);
        }
        if (record.completed_at) validateTimestamp(record.completed_at, `session goal record ${index} completed_at`);
        for (const [label, value] of [['token_budget', record.token_budget], ['token_usage', record.token_usage]] as const) {
            if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
                throw new Error(`session goal record ${index} ${label} must be a non-negative safe integer`);
            }
        }
    });
}

export function sessionSubagentsState(snapshot: SessionSnapshot): SessionSubagentsState | undefined {
    const value = standardStateObject(snapshot, SESSION_STATE_SUBAGENTS);
    if (!value) return undefined;
    const state = value as SessionSubagentsState;
    validateSessionSubagentsState(state, snapshot.session_id);
    return state;
}

export function sessionGoalsState(snapshot: SessionSnapshot): SessionGoalsState | undefined {
    const value = standardStateObject(snapshot, SESSION_STATE_GOALS);
    if (!value) return undefined;
    const state = value as SessionGoalsState;
    validateSessionGoalsState(state);
    return state;
}

/** Enforce capability ownership for standardized snapshot state namespaces. */
export function validateSessionSnapshotState(result: SessionAttachResult): void {
    const known = [
        [SESSION_STATE_GOALS, SESSION_CAPABILITY_GOALS_STATE, () => sessionGoalsState(result.snapshot)],
        [SESSION_STATE_SUBAGENTS, SESSION_CAPABILITY_SUBAGENTS_STATE, () => sessionSubagentsState(result.snapshot)],
    ] as const;
    for (const [key, capability, decoder] of known) {
        const present = Object.prototype.hasOwnProperty.call(result.snapshot.state ?? {}, key);
        const negotiated = (result.capabilities ?? []).includes(capability);
        if (present !== negotiated) {
            if (present) throw new Error(`session state ${key} returned without negotiated capability`);
            throw new Error(`negotiated capability ${capability} requires session state ${key}`);
        }
        if (!present) continue;
        if (result.schema_revision < SESSION_LIFECYCLE_STATE_SCHEMA_REVISION) {
            throw new Error(`session state ${key} requires schema revision ${SESSION_LIFECYCLE_STATE_SCHEMA_REVISION}`);
        }
        decoder();
    }
}

/** Return a typed chat stream payload without consuming another session kind. */
export function chatStreamEventPayload(event: SessionEvent): StreamEvent | undefined {
    return event.kind === SESSION_EVENT_CHAT_STREAM ? (event.payload as StreamEvent) : undefined;
}

function framedPayload<T>(frame: SessionFrame): T {
    if (frame.payload === null || typeof frame.payload !== 'object' || Array.isArray(frame.payload)) {
        throw new Error('known session frame payload must be an object');
    }
    return frame.payload as T;
}

function validateFramedRevision(frame: SessionFrame, payload: {protocol_version: number; schema_revision: number}): void {
    if (payload.protocol_version !== frame.protocol_version) {
        throw new Error('session frame and payload protocol versions differ');
    }
    if (!Number.isInteger(payload.schema_revision) || payload.schema_revision <= 0 || payload.schema_revision > frame.schema_revision) {
        throw new Error('session frame payload schema revision is invalid');
    }
}

/** Validate correlation plus the structural shape of each known frame payload. */
export function validateSessionFrame(frame: SessionFrame): void {
    if (frame.protocol_version !== SESSION_PROTOCOL_VERSION) throw new Error('unsupported session protocol version');
    if (!Number.isInteger(frame.schema_revision) || frame.schema_revision < SESSION_FRAME_SCHEMA_REVISION) {
        throw new Error(`session frame requires schema revision ${SESSION_FRAME_SCHEMA_REVISION} or newer`);
    }
    if (!frame.type) throw new Error('session frame type is required');
    if (frame.payload === undefined) throw new Error('session frame payload is required');

    const correlated = new Set([SESSION_FRAME_ATTACH_REQUEST, SESSION_FRAME_ATTACH_RESULT, SESSION_FRAME_ERROR]);
    if (correlated.has(frame.type) && !frame.request_id) throw new Error(`${frame.type} session frame requires a request id`);
    if (frame.type === SESSION_FRAME_EVENT && frame.request_id) {
        throw new Error('session event frame must not carry a request id');
    }

    switch (frame.type) {
        case SESSION_FRAME_ATTACH_REQUEST: {
            const request = sessionFrameAttachRequest(frame);
            if (!request) throw new Error('session frame is not an attach request');
            validateSessionAttachRequest(request);
            validateFramedRevision(frame, request);
            break;
        }
        case SESSION_FRAME_ATTACH_RESULT: {
            const result = sessionFrameAttachResult(frame);
            if (!result) throw new Error('session frame is not an attach result');
            if (!result.workspace_id || !result.session_id) throw new Error('framed attach result requires resolved identity');
            if (!result.snapshot || result.snapshot.workspace_id !== result.workspace_id || result.snapshot.session_id !== result.session_id) {
                throw new Error('framed attach result snapshot identity does not match');
            }
            validateSessionCursor(result.snapshot.cursor);
            validateSessionSnapshotState(result);
            validateFramedRevision(frame, result);
            break;
        }
        case SESSION_FRAME_EVENT: {
            const event = sessionFrameEvent(frame);
            if (!event) throw new Error('session frame is not an event');
            validateSessionEvent(event);
            validateFramedRevision(frame, event);
            break;
        }
        case SESSION_FRAME_ERROR: {
            const error = sessionFrameError(frame);
            if (!error) throw new Error('session frame is not an error');
            if (!error.code || !error.message) throw new Error('session error code and message are required');
            break;
        }
    }
}

export function sessionFrameAttachRequest(frame: SessionFrame): SessionAttachRequest | undefined {
    return frame.type === SESSION_FRAME_ATTACH_REQUEST ? framedPayload<SessionAttachRequest>(frame) : undefined;
}

export function sessionFrameAttachResult(frame: SessionFrame): SessionAttachResult | undefined {
    return frame.type === SESSION_FRAME_ATTACH_RESULT ? framedPayload<SessionAttachResult>(frame) : undefined;
}

export function sessionFrameEvent(frame: SessionFrame): SessionEvent | undefined {
    return frame.type === SESSION_FRAME_EVENT ? framedPayload<SessionEvent>(frame) : undefined;
}

export function sessionFrameError(frame: SessionFrame): SessionErrorPayload | undefined {
    return frame.type === SESSION_FRAME_ERROR ? framedPayload<SessionErrorPayload>(frame) : undefined;
}
