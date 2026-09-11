/**
 * Unit tests for the spec-adapter helpers in ``specAdapters.ts``.
 *
 * Current coverage focuses on ``feedbackToSpecMessage`` — the helper
 * called by ``ChatBody.handleFeedback`` to turn an 'up' | 'down' | null
 * toggle into a universal-messaging-spec ChatMessage. The shape must
 * match what the backend's ``on_ws_chat_feedback`` expects:
 *   - role === 'user'
 *   - content is one FeedbackPart
 *   - ref.message_id targets the assistant message
 *   - ref.relationship === 'feedback'
 */
import {describe, expect, it} from 'vitest';
import type {FeedbackPart} from '@scitrera/messaging-spec';

import {feedbackToSpecMessage} from './specAdapters';

describe('feedbackToSpecMessage', () => {
    it('builds a spec ChatMessage with a single FeedbackPart', () => {
        const msg = feedbackToSpecMessage({
            targetMessageId: 'msg_assistant_1',
            sentiment: 1,
            text: 'great answer',
        });

        expect(msg.schema_version).toBe('1.0');
        expect(msg.role).toBe('user');
        expect(msg.content).toHaveLength(1);
        const part = msg.content[0] as FeedbackPart;
        expect(part.type).toBe('feedback');
        expect(part.sentiment).toBe(1);
        expect(part.text).toBe('great answer');
    });

    it('targets the assistant message via ref.message_id + ref.relationship', () => {
        const msg = feedbackToSpecMessage({
            targetMessageId: 'msg_target',
            sentiment: -1,
        });
        expect(msg.ref).toBeTruthy();
        expect(msg.ref?.message_id).toBe('msg_target');
        expect(msg.ref?.relationship).toBe('feedback');
    });

    it('omits text when not provided (sets to null)', () => {
        const msg = feedbackToSpecMessage({
            targetMessageId: 'm',
            sentiment: 1,
        });
        const part = msg.content[0] as FeedbackPart;
        expect(part.text).toBeNull();
    });

    it('sentiment=0 (cleared) still produces a valid spec message', () => {
        // Convention: null toggle → sentiment=0. We still emit a spec
        // message so MemoryLayer captures the clearing event for
        // analytics (rather than silently dropping).
        const msg = feedbackToSpecMessage({
            targetMessageId: 'm',
            sentiment: 0,
        });
        const part = msg.content[0] as FeedbackPart;
        expect(part.sentiment).toBe(0);
    });

    it('supports wider sentiment scales (forward-compat, no enum)', () => {
        const msg = feedbackToSpecMessage({
            targetMessageId: 'm',
            sentiment: 2,
            text: 'very good',
        });
        const part = msg.content[0] as FeedbackPart;
        expect(part.sentiment).toBe(2);
    });

    it('uses caller-supplied id and timestamp when given', () => {
        const msg = feedbackToSpecMessage({
            targetMessageId: 'm',
            sentiment: 1,
            id: 'msg_caller_id',
            timestamp: 1234567890,
        });
        expect(msg.id).toBe('msg_caller_id');
        // created_at must reflect the supplied unix-seconds timestamp as ISO 8601.
        expect(msg.created_at).toBe(new Date(1234567890 * 1000).toISOString());
    });

    it('generates a deterministic id pattern when none supplied', () => {
        const msg = feedbackToSpecMessage({
            targetMessageId: 'm',
            sentiment: 1,
            timestamp: 1700000000,
        });
        // Mirrors the userInputToSpecMessage id convention.
        expect(msg.id).toBe('msg_1700000000_feedback');
    });

    it('round-trips through JSON unchanged', () => {
        const msg = feedbackToSpecMessage({
            targetMessageId: 'msg_target',
            sentiment: 1,
            text: 'thanks',
            timestamp: 1700000000,
        });
        const roundtripped = JSON.parse(JSON.stringify(msg));
        expect(roundtripped).toEqual(msg);
    });
});
