import {describe, expect, it} from 'vitest';

import attachRequestFixture from '../../go/testdata/session/attach-request.json';
import attachRequestDefaultWorkspaceFixture from '../../go/testdata/session/attach-request-default-workspace.json';
import attachResultCompleteFixture from '../../go/testdata/session/attach-result-complete.json';
import attachResultFixture from '../../go/testdata/session/attach-result-partial.json';
import attachResultUnavailableFixture from '../../go/testdata/session/attach-result-unavailable.json';
import attachRequestStateFixture from '../../go/testdata/session/attach-request-state.json';
import attachResultStateFixture from '../../go/testdata/session/attach-result-state.json';
import frameAttachRequestFixture from '../../go/testdata/session/frame-attach-request.json';
import frameAttachResultFixture from '../../go/testdata/session/frame-attach-result.json';
import frameErrorFixture from '../../go/testdata/session/frame-error.json';
import frameEventFixture from '../../go/testdata/session/frame-event.json';

import {
    SESSION_CAPABILITY_MULTI_WORKSPACE,
    SESSION_CAPABILITY_GOALS_STATE,
    SESSION_CAPABILITY_REPLAY,
    SESSION_CAPABILITY_SNAPSHOT,
    SESSION_CAPABILITY_SUBAGENTS_STATE,
    SESSION_STATE_GOALS,
    SESSION_STATE_SUBAGENTS,
    SESSION_FRAME_ATTACH_REQUEST,
    SESSION_FRAME_ERROR,
    SESSION_FRAME_EVENT,
    chatStreamEventPayload,
    compareSessionCursors,
    negotiateSessionCapabilities,
    normalizeSessionCapabilities,
    sessionFrameAttachRequest,
    sessionFrameEvent,
    sessionGoalsState,
    sessionSubagentsState,
    validateSessionSubagentsState,
    validateSessionAttachResult,
    validateSessionFrame,
    type SessionAttachRequest,
    type SessionAttachResult,
    type SessionFrame,
    type SessionSubagentsState,
} from '../src/index';

function fixture<T>(value: unknown): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

describe('session capabilities and cursors', () => {
    it('normalizes and negotiates deterministically', () => {
        const request = fixture<SessionAttachRequest>(attachRequestFixture);
        const expected = [SESSION_CAPABILITY_REPLAY, SESSION_CAPABILITY_SNAPSHOT];
        expect(normalizeSessionCapabilities(request.capabilities ?? [])).toEqual(expected);
        expect(
            negotiateSessionCapabilities(request.capabilities ?? [], [
                SESSION_CAPABILITY_MULTI_WORKSPACE,
                SESSION_CAPABILITY_SNAPSHOT,
                SESSION_CAPABILITY_REPLAY,
            ]),
        ).toEqual(expected);
    });

    it('only compares cursors in the same generation', () => {
        expect(compareSessionCursors({generation: 'worker-a', sequence: 1}, {generation: 'worker-a', sequence: 2})).toBe(-1);
        expect(() =>
            compareSessionCursors({generation: 'worker-a', sequence: 1}, {generation: 'worker-b', sequence: 1}),
        ).toThrow('generations differ');
    });
});

describe('multiplexed session frames', () => {
    it.each([
        ['attach request', frameAttachRequestFixture],
        ['attach result', frameAttachResultFixture],
        ['event', frameEventFixture],
        ['error', frameErrorFixture],
    ])('validates the shared %s fixture', (_name, value) => {
        const frame = fixture<SessionFrame>(value);
        expect(() => validateSessionFrame(frame)).not.toThrow();
    });

    it('decodes known payloads and enforces correlation', () => {
        const requestFrame = fixture<SessionFrame>(frameAttachRequestFixture);
        expect(requestFrame.type).toBe(SESSION_FRAME_ATTACH_REQUEST);
        expect(sessionFrameAttachRequest(requestFrame)?.client_id).toBe('client-1');

        const eventFrame = fixture<SessionFrame>(frameEventFixture);
        expect(eventFrame.type).toBe(SESSION_FRAME_EVENT);
        expect(sessionFrameEvent(eventFrame)?.cursor.sequence).toBe(1);

        delete requestFrame.request_id;
        expect(() => validateSessionFrame(requestFrame)).toThrow('requires a request id');
    });

    it('requires errors to be correlated and events not to be', () => {
        const errorFrame = fixture<SessionFrame>(frameErrorFixture);
        expect(errorFrame.type).toBe(SESSION_FRAME_ERROR);
        delete errorFrame.request_id;
        expect(() => validateSessionFrame(errorFrame)).toThrow('requires a request id');

        const eventFrame = fixture<SessionFrame>(frameEventFixture);
        eventFrame.request_id = 'attach-1';
        expect(() => validateSessionFrame(eventFrame)).toThrow('must not carry a request id');
    });
});

describe('session attach and replay', () => {
    it('validates the shared partial-replay fixture', () => {
        const request = fixture<SessionAttachRequest>(attachRequestFixture);
        const result = fixture<SessionAttachResult>(attachResultFixture);
        expect(() => validateSessionAttachResult(result, request)).not.toThrow();
        expect(result.workspace_id).toBe('project-a');
        const first = result.replay?.events?.[0];
        if (!first) throw new Error('fixture replay event missing');
        const payload = chatStreamEventPayload(first);
        expect(payload).toMatchObject({event: 'token_delta', text: 'lo'});
    });

    it('validates the shared complete-replay fixture', () => {
        const request = fixture<SessionAttachRequest>(attachRequestFixture);
        const result = fixture<SessionAttachResult>(attachResultCompleteFixture);
        expect(() => validateSessionAttachResult(result, request)).not.toThrow();
    });

    it('resolves an omitted workspace after a generation change', () => {
        const request = fixture<SessionAttachRequest>(attachRequestDefaultWorkspaceFixture);
        const result = fixture<SessionAttachResult>(attachResultUnavailableFixture);
        expect(() => validateSessionAttachResult(result, request)).not.toThrow();
        expect(request.workspace_id).toBeUndefined();
        expect(result.workspace_id).toBe('default');
    });

    it('validates and decodes deterministic lifecycle state', () => {
        const request = fixture<SessionAttachRequest>(attachRequestStateFixture);
        const result = fixture<SessionAttachResult>(attachResultStateFixture);
        expect(() => validateSessionAttachResult(result, request)).not.toThrow();
        expect(sessionGoalsState(result.snapshot)?.records[0]?.token_usage).toBe(125);
        expect(sessionSubagentsState(result.snapshot)?.records[0]?.child_session_id).toBe('session-1::sub::1');
    });

    it('requires lifecycle capabilities and deterministic record IDs', () => {
        const request = fixture<SessionAttachRequest>(attachRequestStateFixture);
        const result = fixture<SessionAttachResult>(attachResultStateFixture);
        result.capabilities = [SESSION_CAPABILITY_SNAPSHOT, SESSION_CAPABILITY_SUBAGENTS_STATE];
        expect(() => validateSessionAttachResult(result, request)).toThrow('without negotiated capability');

        const missing = fixture<SessionAttachResult>(attachResultStateFixture);
        delete missing.snapshot.state[SESSION_STATE_GOALS];
        expect(() => validateSessionAttachResult(missing, request)).toThrow('requires session state');

        const duplicate = fixture<SessionAttachResult>(attachResultStateFixture);
        const state = duplicate.snapshot.state[SESSION_STATE_SUBAGENTS] as {records: Array<Record<string, unknown>>};
        state.records.push({...state.records[0]!});
        expect(() => validateSessionAttachResult(duplicate, request)).toThrow('unique IDs');
        expect(request.capabilities).toContain(SESSION_CAPABILITY_GOALS_STATE);
    });

    it('requires a terminal timestamp for interrupted children', () => {
        const result = fixture<SessionAttachResult>(attachResultStateFixture);
        const state = result.snapshot.state[SESSION_STATE_SUBAGENTS] as unknown as SessionSubagentsState;
        state.records[0]!.status = 'interrupted';
        expect(() => validateSessionSubagentsState(state, result.session_id)).toThrow('completed_at');
        state.records[0]!.completed_at = state.records[0]!.updated_at;
        expect(() => validateSessionSubagentsState(state, result.session_id)).not.toThrow();
    });

    it('permits an omitted requested workspace', () => {
        const request: SessionAttachRequest = {
            protocol_version: 1,
            schema_revision: 1,
            session_id: 'session-1',
            client_id: 'client-1',
        };
        expect(request.workspace_id).toBeUndefined();
    });

    it('rejects a replay event from another workspace', () => {
        const request = fixture<SessionAttachRequest>(attachRequestFixture);
        const result = fixture<SessionAttachResult>(attachResultFixture);
        const first = result.replay?.events?.[0];
        if (!first) throw new Error('fixture replay event missing');
        first.workspace_id = 'project-b';
        expect(() => validateSessionAttachResult(result, request)).toThrow('identity does not match');
    });

    it('rejects a different explicitly requested workspace', () => {
        const request = fixture<SessionAttachRequest>(attachRequestFixture);
        const result = fixture<SessionAttachResult>(attachResultFixture);
        result.workspace_id = 'project-b';
        result.snapshot.workspace_id = 'project-b';
        expect(() => validateSessionAttachResult(result, request)).toThrow('explicit request');
    });

    it('preserves unknown cursor fields through ordinary JSON handling', () => {
        const cursor = JSON.parse('{"generation":"worker-a","sequence":1,"future":"kept"}');
        expect(JSON.parse(JSON.stringify(cursor))).toMatchObject({future: 'kept'});
    });
});
