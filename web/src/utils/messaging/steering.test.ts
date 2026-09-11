/**
 * Unit tests for mid-turn steering support in ``specAdapters.ts``.
 *
 * A steering send is an interjection into the turn already running on the
 * thread rather than the start of a new one. Two halves are tested here:
 *
 *   - outbound: ``userInputToSpecMessage({steering: true})`` sets
 *     ``meta.steering``, which is the signal the app-server uses to skip
 *     minting a chat task (see agent-harness/docs/mid-run-steering-design.md);
 *   - inbound: the agent wraps a delivered interjection in
 *     ``[user_steering]…[/user_steering]`` so the model reads it as an
 *     interjection. Those tags are protocol and must never reach the screen.
 */
import {describe, expect, it} from 'vitest';
import type {ChatMessage as SpecChatMessage} from '@scitrera/messaging-spec';

import {
    isSteeringMessage,
    specMessageText,
    stripSteeringWrapper,
    userInputToSpecMessage,
} from './specAdapters';

function textMessage(text: string): SpecChatMessage {
    return {
        schema_version: '1.0',
        id: 'msg_1',
        role: 'user',
        created_at: new Date(0).toISOString(),
        content: [{type: 'text', text}],
        addr: {},
        meta: {},
        ref: null,
    } as SpecChatMessage;
}

describe('userInputToSpecMessage steering flag', () => {
    it('marks a steering send so the server skips minting a task', () => {
        const msg = userInputToSpecMessage({text: 'actually, use yarn', steering: true});
        expect(msg.meta).toEqual({steering: true});
    });

    it('leaves an ordinary send exactly as it was before the option existed', () => {
        const msg = userInputToSpecMessage({text: 'build it'});
        expect(msg.meta).toEqual({});
    });

    it('does not mark a send when steering is explicitly false', () => {
        const msg = userInputToSpecMessage({text: 'build it', steering: false});
        expect(msg.meta).toEqual({});
    });
});

describe('stripSteeringWrapper', () => {
    it('removes the wrapper the agent adds around an interjection', () => {
        expect(stripSteeringWrapper('[user_steering]\nuse yarn\n[/user_steering]')).toBe('use yarn');
    });

    it('leaves ordinary text untouched', () => {
        expect(stripSteeringWrapper('use yarn')).toBe('use yarn');
    });

    it('leaves text that merely mentions the tag untouched', () => {
        // Only a whole-text wrapper is protocol; a user quoting the tag is not.
        const quoted = 'the agent prints [user_steering] around interjections';
        expect(stripSteeringWrapper(quoted)).toBe(quoted);
    });

    it('does not strip an unclosed wrapper', () => {
        const partial = '[user_steering]\nuse yarn';
        expect(stripSteeringWrapper(partial)).toBe(partial);
    });
});

describe('specMessageText', () => {
    it('returns what the user actually typed for a steering interjection', () => {
        // Copy and edit run through this helper, so the tags must be gone here
        // rather than at each call site.
        const msg = textMessage('[user_steering]\nskip the tests\n[/user_steering]');
        expect(specMessageText(msg)).toBe('skip the tests');
    });

    it('is unchanged for an ordinary message', () => {
        expect(specMessageText(textMessage('build it'))).toBe('build it');
    });
});

describe('isSteeringMessage', () => {
    it('identifies a delivered interjection', () => {
        expect(isSteeringMessage(textMessage('[user_steering]\nuse yarn\n[/user_steering]'))).toBe(true);
    });

    it('does not identify an ordinary message', () => {
        expect(isSteeringMessage(textMessage('use yarn'))).toBe(false);
    });
});
