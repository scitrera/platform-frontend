import {describe, expect, it} from 'vitest';
import {DEFAULT_APPS, UI_CONSTANTS} from '@/constants/AppConstants';
import {resolveAppPanel} from './appPanels';

describe('dynamic app pane configuration', () => {
    it('opens an internal preview without requiring a workspace app entry', () => {
        expect(resolveAppPanel('_preview', [], {
            title: 'Preview', closeable: false, ownerAppId: 'review',
        })).toEqual({id: '_preview', type: '_preview', title: 'Preview',
            closeable: false, ownerAppId: 'review'});
    });
    it('preserves known app metadata and allows presentation overrides', () => {
        const app = {id: 'review', type: 'dynamic', name: 'Review', mode: 'no-chat', closeable: true};
        expect(resolveAppPanel('review', [app], {title: 'Preview', closeable: false}))
            .toEqual({...app, title: 'Preview', closeable: false});
        expect(app.closeable).toBe(true);
    });
    it('retains chat and null navigation behavior', () => {
        expect(resolveAppPanel(UI_CONSTANTS.APP_ID_CHAT, [])).toEqual(DEFAULT_APPS.DEFAULT_CHAT_APP);
        expect(resolveAppPanel(null, [])).toBeNull();
    });
});
