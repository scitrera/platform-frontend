import {useState, useRef, useCallback} from 'react';

/**
 * useRpcMutation - hook for write/action RPC calls (not automatic).
 *
 * Usage in dynamic JSX:
 *   const { mutate, data, loading, error } = useRpcMutation(rpcToolCall, "generate_report");
 *   // later:
 *   mutate({ report_id: "abc" }).then(result => { ... });
 *
 * @param {function} rpcToolCall - the rpcToolCall function from scope
 * @param {string} toolName - name of the backend tool to call
 * @returns {{ mutate: function, data: any, loading: boolean, error: any, reset: function }}
 */
export function useRpcMutation(rpcToolCall, toolName) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const mountedRef = useRef(true);

    const mutate = useCallback(async (args = {}) => {
        setLoading(true);
        setError(null);
        try {
            const result = await rpcToolCall(toolName, args);
            if (mountedRef.current) {
                setData(result);
                setLoading(false);
            }
            return result;
        } catch (err) {
            if (mountedRef.current) {
                setError(err?.message || err);
                setLoading(false);
            }
            throw err;
        }
    }, [rpcToolCall, toolName]);

    const reset = useCallback(() => {
        setData(null);
        setError(null);
        setLoading(false);
    }, []);

    return {mutate, data, loading, error, reset};
}
