import {useState, useEffect, useRef, useCallback} from 'react';

/**
 * usePolling - periodically calls a fetcher function.
 *
 * @param {function} fetcher - async function to call on each interval
 * @param {number} [intervalMs=5000] - polling interval in ms
 * @param {Array} [deps=[]] - dependency array; polling restarts when deps change
 * @param {boolean} [enabled=true] - set to false to pause polling
 * @returns {{ data: any, loading: boolean, error: any, refetch: function }}
 */
export function usePolling(fetcher, intervalMs = 5000, deps = [], enabled = true) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const fetcherRef = useRef(fetcher);

    // Keep fetcher ref current without restarting the interval
    useEffect(() => {
        fetcherRef.current = fetcher;
    }, [fetcher]);

    const execute = useCallback(async () => {
        try {
            const result = await fetcherRef.current();
            setData(result);
            setError(null);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;

        setLoading(true);
        execute(); // immediate first call

        const id = setInterval(execute, intervalMs);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [intervalMs, enabled, execute, ...deps]);

    return {data, loading, error, refetch: execute};
}
