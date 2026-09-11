import {useContext, useEffect} from 'react';
import {LibraryContext} from '../contexts/LibraryContext';

/**
 * Access library state, loading it on first use.
 *
 * The provider is mounted app-wide, so it cannot load eagerly without listing
 * the workspace's files on every page of every app — work that is discarded
 * everywhere except here. Declaring the need from the hook rather than from
 * each component means a new consumer cannot forget to, and cannot
 * accidentally render against data nothing asked for.
 */
export function useLibraryState() {
    const ctx = useContext(LibraryContext);
    if (!ctx) {
        throw new Error('useLibraryState must be used within a LibraryProvider');
    }

    const {ensureLoaded} = ctx;
    useEffect(() => {
        ensureLoaded();
    }, [ensureLoaded]);

    return ctx;
}
