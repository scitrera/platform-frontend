import {describe, expect, it, vi} from 'vitest';
import {followAuthApplicationRedirect} from './authRedirect.js';

const valid = {auth: 'valid', tenants: [{id: 'acme'}], redirect_url: 'https://acme.example/acme'};
describe('tenant application routing', () => {
    it('uses the configured endpoint from the generic root', () => {
        const location = {href: 'https://app.example/', replace: vi.fn()};
        expect(followAuthApplicationRedirect(valid, location)).toBe(true);
        expect(location.replace).toHaveBeenCalledWith(valid.redirect_url);
    });
    it.each([
        [{...valid, redirect_url: undefined}, 'https://app.example/'],
        [{...valid, auth: 'invalid'}, 'https://app.example/'],
        [{...valid, authorized: false}, 'https://app.example/'],
        [{...valid, tenants: []}, 'https://app.example/'],
        [{...valid, tenants: [{id: 'acme'}, {id: 'other'}]}, 'https://app.example/'],
        [valid, 'https://app.example/acme'],
        [valid, 'https://app.example/acme/workspace?file=one#section'],
        [valid, 'https://acme.example/'],
        [{...valid, redirect_url: 'javascript:alert(1)'}, 'https://app.example/'],
        [{...valid, redirect_url: 'http://acme.example/acme'}, 'https://app.example/'],
        [{...valid, redirect_url: 'https://user:pass@acme.example/acme'}, 'https://app.example/'],
    ])('preserves explicit navigation and rejects invalid hints %#', (data, href) => {
        const location = {href, replace: vi.fn()};
        expect(followAuthApplicationRedirect(data, location)).toBe(false);
        expect(location.replace).not.toHaveBeenCalled();
    });
});
