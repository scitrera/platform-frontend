/**
 * Regression test for the universal messaging-spec reducer integration.
 *
 * Replays a representative ``CHAT_STREAM`` sequence — the same shape the
 * sidecar's SpecMessageEmitter produces and the WS server relays —
 * through ``applyEvent`` / ``reduceEvents`` and verifies that the
 * resulting state map equals the canonical ``message_finalized.message``
 * payload exactly. This catches drift between the reducer here, the
 * sibling TS implementation in
 * ``scitrera-ecosystem-messaging-spec/typescript/src/applyEvent.ts``,
 * and the Python implementation in
 * ``scitrera_messaging_spec.events.apply_event``.
 */
import {describe, expect, it} from 'vitest';

import type {ChatMessage, StreamEvent, TextPart, ToolCallPart} from '@scitrera/messaging-spec';
import {MESSAGING_SCHEMA_VERSION, applyEvent, reduceEvents} from '@scitrera/messaging-spec';

const MSG_ID = 'msg_001';

function makeBaseMessage(): ChatMessage {
    return {
        schema_version: MESSAGING_SCHEMA_VERSION,
        id: MSG_ID,
        role: 'assistant',
        created_at: '2026-05-26T00:00:00Z',
        content: [],
        addr: {tenant_id: 't', workspace_id: 'w', thread_id: 'thr'},
        meta: {},
        ref: null,
    };
}

function makeFinalizedMessage(): ChatMessage {
    const base = makeBaseMessage();
    const text: TextPart = {type: 'text', text: 'Hello world'};
    const tool: ToolCallPart = {
        type: 'tool_call',
        id: 'tc_1',
        name: 'search',
        args: {q: 'unit test'},
        status: 'completed',
    };
    return {...base, content: [text, tool]};
}

describe('applyEvent — CHAT_STREAM integration', () => {
    it('replays a typical stream into a coherent ChatMessage', () => {
        const finalized = makeFinalizedMessage();
        const events: StreamEvent[] = [
            {
                event: 'message_started',
                message: makeBaseMessage(),
            },
            {
                event: 'part_appended',
                message_id: MSG_ID,
                index: 0,
                part: {type: 'text', text: ''},
            },
            {
                event: 'token_delta',
                message_id: MSG_ID,
                index: 0,
                text: 'Hello ',
            },
            {
                event: 'token_delta',
                message_id: MSG_ID,
                index: 0,
                text: 'world',
            },
            {
                event: 'part_appended',
                message_id: MSG_ID,
                index: 1,
                part: {
                    type: 'tool_call',
                    id: 'tc_1',
                    name: 'search',
                    args: {q: 'unit test'},
                    status: 'running',
                },
            },
            {
                event: 'part_updated',
                message_id: MSG_ID,
                index: 1,
                patch: {status: 'completed'},
            },
            {
                event: 'message_finalized',
                message_id: MSG_ID,
                message: finalized,
            },
        ];

        const state = reduceEvents(events);

        // Exactly one message in the map.
        expect(Object.keys(state)).toEqual([MSG_ID]);

        const reconstructed = state[MSG_ID];
        // Must equal the finalized payload exactly (spec invariant).
        expect(reconstructed).toEqual(finalized);

        // And the content parts are what we'd expect from the stream
        // replay (sanity-check before finalize would have collapsed
        // small reducer bugs into the equality above).
        expect(reconstructed.content).toHaveLength(2);
        expect(reconstructed.content[0]).toMatchObject({type: 'text', text: 'Hello world'});
        expect(reconstructed.content[1]).toMatchObject({
            type: 'tool_call',
            id: 'tc_1',
            name: 'search',
            status: 'completed',
        });
    });

    it('drops unknown event kinds (forward-compat)', () => {
        const state0 = {};
        // @ts-expect-error — exercising the default branch on purpose.
        const state1 = applyEvent(state0, {event: 'mystery_event', message_id: 'x'});
        expect(state1).toBe(state0);
    });

    it('ignores token_delta / part_updated for unknown message ids', () => {
        const state0 = {};
        const state1 = applyEvent(state0, {
            event: 'token_delta',
            message_id: 'nope',
            index: 0,
            text: 'x',
        });
        const state2 = applyEvent(state0, {
            event: 'part_updated',
            message_id: 'nope',
            index: 0,
            patch: {status: 'completed'},
        });
        expect(state1).toBe(state0);
        expect(state2).toBe(state0);
    });
});
