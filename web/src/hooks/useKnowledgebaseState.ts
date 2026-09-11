import {useContext, useEffect} from 'react';
import {KnowledgebaseContext} from '../contexts/KnowledgebaseContext';

/**
 * Access knowledgebase state, loading it on first use.
 *
 * The provider is mounted app-wide, so it cannot load eagerly without
 * fetching the metadata and article list on every page of every app — work
 * that is discarded everywhere except here. Declaring the need from the hook
 * rather than from each component means a new consumer cannot forget to, and
 * cannot accidentally render against data nothing asked for.
 */
export function useKnowledgebaseState() {
    const ctx = useContext(KnowledgebaseContext);
    if (!ctx) {
        throw new Error('useKnowledgebaseState must be used within a KnowledgebaseProvider');
    }

    const {ensureLoaded} = ctx;
    useEffect(() => {
        ensureLoaded();
    }, [ensureLoaded]);

    return ctx;
}
