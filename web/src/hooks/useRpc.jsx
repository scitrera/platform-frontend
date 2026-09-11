import {useState, useEffect, useRef, useCallback} from 'react';

/**
 * useRpc - SWR-like hook for read-only RPC calls.
 *
 * Usage in dynamic JSX:
 *   const { data, loading, error, refetch } = useRpc(rpcToolCall, "bids_list", { page: 1 }, [page]);
 *
 * @param {function} rpcToolCall - the rpcToolCall function from scope
 * @param {string} toolName - name of the backend tool to call
 * @param {object} [args={}] - arguments to pass
 * @param {Array} [deps=[]] - dependency array; refetches when deps change
 * @param {boolean} [enabled=true] - set to false to skip the call
 * @returns {{ data: any, loading: boolean, error: any, refetch: function }}
 */
export function useRpc(rpcToolCall, toolName, args = {}, deps = [], enabled = true) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const argsRef = useRef(args);

    useEffect(() => {
        argsRef.current = args;
    }, [args]);

    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await rpcToolCall(toolName, argsRef.current);
            setData(result);
        } catch (err) {
            setError(err?.message || err);
        } finally {
            setLoading(false);
        }
    }, [rpcToolCall, toolName]);

    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }
        fetch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetch, enabled, ...deps]);

    return {data, loading, error, refetch: fetch};
}
