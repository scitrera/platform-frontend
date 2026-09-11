/**
 * Unit tests for ``ArrivalOrder`` — the skew-proof live-transcript ordering.
 *
 * The regression it guards: the optimistic user message is stamped with the
 * CLIENT clock and the assistant's message_started with the SERVER clock, so a
 * client-ahead skew would sort the user message AFTER its reply if ordering used
 * created_at. Arrival order (first-seen wins) keeps causal order regardless.
 */
import {describe, expect, it} from 'vitest';
import type {ChatMessage as SpecChatMessage} from '@scitrera/messaging-spec';

import {ArrivalOrder} from './messageOrder';

function msg(id: string, role: SpecChatMessage['role'], createdAtMs: number | null): SpecChatMessage {
    return {
        schema_version: '1.0',
        id,
        role,
        created_at: createdAtMs == null ? null : new Date(createdAtMs).toISOString(),
        content: [],
        addr: {},
        meta: {},
        ref: null,
    };
}

describe('ArrivalOrder', () => {
    it('keeps a client-ahead user message before its server-stamped reply (skew regression)', () => {
        const order = new ArrivalOrder();
        // User sent first — but its CLIENT-clock timestamp is 1 minute AHEAD of
        // the assistant's SERVER-clock message_started.
        const user = msg('u1', 'user', 1_000_060_000);
        const assistant = msg('a1', 'assistant', 1_000_000_000);

        // Separate observes mirror the live path: the optimistic user insert
        // commits a render before the assistant's message_started arrives.
        order.observe([user]);
        const list = order.order([assistant, user]);

        expect(list.map(m => m.id)).toEqual(['u1', 'a1']);
    });

    it('orders a bulk (history) load chronologically by created_at', () => {
        const order = new ArrivalOrder();
        // A history reload arrives as ONE batch, unsorted; created_at seeds order.
        const a = msg('a', 'user', 3000);
        const b = msg('b', 'assistant', 1000);
        const c = msg('c', 'user', 2000);

        const list = order.order([a, b, c]);

        expect(list.map(m => m.id)).toEqual(['b', 'c', 'a']);
    });

    it('is idempotent: a message keeps its first arrival index', () => {
        const order = new ArrivalOrder();
        const first = msg('x', 'user', 5000);
        const second = msg('y', 'assistant', 1000); // earlier clock, later arrival

        order.observe([first]);
        order.observe([second]);
        // Re-observing must not renumber; y stays after x despite older created_at.
        const list = order.order([second, first]);

        expect(list.map(m => m.id)).toEqual(['x', 'y']);
    });

    it('sorts never-seen ids last via keyOf', () => {
        const order = new ArrivalOrder();
        order.observe([msg('seen', 'user', 1000)]);
        expect(order.keyOf('seen')).toBe(0);
        expect(order.keyOf('unseen')).toBe(Number.POSITIVE_INFINITY);
    });
});
