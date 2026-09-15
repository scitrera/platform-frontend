import {beforeEach, describe, expect, it} from 'vitest';
import {useAppPanelStore} from './appPanelStore';

const preview = {id: '_preview', title: 'Preview', closeable: false, ownerAppId: 'review'};
const store = () => useAppPanelStore.getState();

beforeEach(() => {
    localStorage.clear();
    useAppPanelStore.setState({main: null, secondary: null});
    store().loadApp({id: 'review'});
});

describe('owned secondary app panes', () => {
    it('stays open during parent updates and can be closed programmatically', () => {
        store().loadApp2(preview);
        store().loadApp({id: 'review'}, {queryParams: {id: 'another-document'}});
        expect(store().secondary).toEqual(preview);
        store().closeApp2();
        expect(store().secondary).toBeNull();
    });
    it.each(['close', 'switch', 'clear'])('removes the preview on parent %s', (action) => {
        store().loadApp2(preview);
        if (action === 'close') store().closeMainApp();
        if (action === 'switch') store().loadApp({id: 'another-app'});
        if (action === 'clear') store().loadApp(null);
        expect(store().secondary).toBeNull();
        // Late RPC completion from the previous app cannot reopen its preview.
        store().loadApp2(preview);
        expect(store().secondary).toBeNull();
    });
    it('preserves independent secondary apps when the main app leaves', () => {
        const independent = {id: 'reference'};
        store().loadApp2(independent);
        store().loadApp({id: 'another-app'});
        expect(store().secondary).toEqual(independent);
        store().closeMainApp();
        expect(store().secondary).toEqual(independent);
    });
});
