/**
 * Live-transcript message ordering keyed by first-seen ARRIVAL order rather
 * than ``created_at``.
 *
 * Why not created_at: on the live path the optimistic user message is stamped
 * with the CLIENT clock (``userInputToSpecMessage`` → ``Date.now()``), while the
 * assistant's ``message_started`` is stamped with the SERVER clock (the harness).
 * Any client-ahead clock skew then sorts the user's message AFTER the reply it
 * triggered. History reload is immune — there both timestamps are server-domain —
 * which is exactly why the bug is live-only. Arrival order reflects causal order
 * (user typed → reply streamed) and is skew-proof.
 *
 * ``created_at`` is still used to (a) order the ids WITHIN a single bulk observe
 * so a history / thread load lands oldest→newest, and (b) break ties. A lone new
 * id (a live insert) lands after everything already seen. Assignment is
 * idempotent: an id keeps its first arrival index for the lifetime of the order.
 */
import type {ChatMessage as SpecChatMessage} from '@scitrera/messaging-spec';
import {specMessageTimestamp} from './specAdapters';

export class ArrivalOrder {
    private seq = new Map<string, number>();
    private next = 0;

    /**
     * Assign an arrival index to every not-yet-seen message id. Ids that appear
     * together in one call (a history/thread batch) are ordered by ``created_at``
     * so the batch is chronological; a single live insert has nothing to sort
     * against and simply lands next. Already-seen ids are untouched.
     */
    observe(msgs: readonly SpecChatMessage[]): void {
        const fresh = msgs.filter(m => m.id && !this.seq.has(m.id));
        if (fresh.length === 0) return;
        fresh.sort((a, b) => specMessageTimestamp(a) - specMessageTimestamp(b));
        for (const m of fresh) this.seq.set(m.id, this.next++);
    }

    /** Observe, then return the messages sorted oldest→newest by arrival. */
    order(msgs: readonly SpecChatMessage[]): SpecChatMessage[] {
        this.observe(msgs);
        return msgs.slice().sort((a, b) => this.keyOf(a.id) - this.keyOf(b.id));
    }

    /** Arrival index for an id (``+Infinity`` if never seen — sorts last). */
    keyOf(id: string): number {
        const k = this.seq.get(id);
        return k === undefined ? Number.POSITIVE_INFINITY : k;
    }
}
