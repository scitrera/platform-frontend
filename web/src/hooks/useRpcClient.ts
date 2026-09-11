import { useEffect, useRef, useCallback } from 'react';
import { CONNECTION, WORKSPACE } from '@/constants/WebSocketConstants.jsx';
import { SOCKET_CONFIG } from '@/utils/wsConfig.js';
import { DEBUG_MODE } from '@/constants/AppConstants';

/**
 * Standalone RPC client for Socket.IO connections.
 * Extracts the RPC request/response pattern from WebSocketContext.
 * Can be used with any socket.io Socket instance.
 *
 * @param socket   - A socket.io Socket instance (or null when not yet connected)
 * @param windowId - The session window identifier used to tag outgoing messages
 * @param isConnected - Whether the socket is currently connected
 * @returns {{ sendRpcRequest: (type: string, payload: unknown, timeout?: number) => Promise<unknown> }}
 */

interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
}

interface InFlightEntry {
    id: number;
    promise: Promise<unknown>;
}

interface RpcResponseMessage {
    id: number;
    type: string;
    payload: unknown;
    version?: string;
}

interface RpcExceptionMessage {
    id: number;
    error?: string;
    message?: string;
}

export function useRpcClient(
    socket: any,
    windowId: string,
    isConnected: boolean,
) {
    const pendingRequests = useRef<Map<number, PendingRequest>>(new Map());
    const nextRequestId = useRef<number>(1);
    const inFlightByType = useRef<Map<string, InFlightEntry>>(new Map());

    // Stable refs so socket event handlers always see current values without
    // needing to be re-registered every time socket/windowId change.
    const socketRef = useRef<any>(socket);
    const windowIdRef = useRef<string>(windowId);

    useEffect(() => { socketRef.current = socket; }, [socket]);
    useEffect(() => { windowIdRef.current = windowId; }, [windowId]);

    /**
     * Resolve or reject a pending request by id.
     * Shared by both the RPC response handler and the RPX exception handler.
     */
    const handleRpcResponse = useCallback((message: RpcResponseMessage): void => {
        const { id, type, payload } = message;
        const handlers = pendingRequests.current.get(id);
        if (!handlers) {
            console.warn(`useRpcClient: no pending RPC for id ${id}`);
            return;
        }
        pendingRequests.current.delete(id);

        DEBUG_MODE && type !== WORKSPACE.GET_BACKGROUND_TASKS &&
            console.log(`useRpcClient RPC response: ${id}|${type}`, payload);

        handlers.resolve(payload);
    }, []);

    const handleRpcException = useCallback((message: RpcExceptionMessage): void => {
        const { id, error, message: msg } = message;
        const handlers = pendingRequests.current.get(id);
        if (!handlers) {
            console.warn(`useRpcClient: no pending RPC for exception id ${id}`);
            return;
        }
        pendingRequests.current.delete(id);
        handlers.reject(new Error(error ?? msg ?? 'Unknown RPC exception'));
    }, []);

    // Wire up socket event listeners whenever the socket instance changes.
    useEffect(() => {
        if (!socket) {
            return;
        }

        socket.on(CONNECTION.RPC_MESSAGE, handleRpcResponse);
        socket.on(CONNECTION.RPC_EXCEPTION, handleRpcException);

        return () => {
            socket.off(CONNECTION.RPC_MESSAGE, handleRpcResponse);
            socket.off(CONNECTION.RPC_EXCEPTION, handleRpcException);
        };
    }, [socket, handleRpcResponse, handleRpcException]);

    /**
     * Send an RPC request and return a Promise that resolves with the response
     * payload or rejects on timeout/error.
     *
     * Specific message types (currently GET_BACKGROUND_TASKS) are deduplicated:
     * if a request of that type is already in-flight, the same promise is returned.
     *
     * @param type    - The RPC message type (e.g. WORKSPACE.GET_WORKSPACES)
     * @param payload - Arbitrary request payload
     * @param timeout - Optional timeout in ms; defaults to SOCKET_CONFIG.rpcTimeout
     */
    const sendRpcRequest = useCallback(
        (type: string, payload: unknown, timeout: number = SOCKET_CONFIG.rpcTimeout): Promise<unknown> => {
            if (!socketRef.current || !isConnected) {
                return Promise.reject(new Error('useRpcClient: socket not connected'));
            }

            // Deduplicate in-flight requests for specific types (e.g. polling calls).
            const isDeduped = type === WORKSPACE.GET_BACKGROUND_TASKS;
            if (isDeduped) {
                const existing = inFlightByType.current.get(type);
                if (existing?.promise) {
                    return existing.promise;
                }
            }

            const id = nextRequestId.current++;

            const promise = new Promise<unknown>((resolve, reject) => {
                const timer = setTimeout(() => {
                    if (pendingRequests.current.has(id)) {
                        pendingRequests.current.delete(id);
                        if (inFlightByType.current.get(type)?.id === id) {
                            inFlightByType.current.delete(type);
                        }
                        reject(new Error(`useRpcClient: RPC ${type} timed out after ${timeout}ms`));
                    }
                }, timeout);

                const wrappedResolve = (data: unknown) => {
                    clearTimeout(timer);
                    if (inFlightByType.current.get(type)?.id === id) {
                        inFlightByType.current.delete(type);
                    }
                    resolve(data);
                };

                const wrappedReject = (err: unknown) => {
                    clearTimeout(timer);
                    if (inFlightByType.current.get(type)?.id === id) {
                        inFlightByType.current.delete(type);
                    }
                    reject(err);
                };

                pendingRequests.current.set(id, { resolve: wrappedResolve, reject: wrappedReject });

                const outgoing = { id, type, payload, windowId: windowIdRef.current };
                socketRef.current.emit(CONNECTION.RPC_MESSAGE, outgoing);

                DEBUG_MODE && type !== WORKSPACE.GET_BACKGROUND_TASKS &&
                    console.log(`useRpcClient RPC sent: ${id}|${type}`, outgoing);
            });

            if (isDeduped) {
                inFlightByType.current.set(type, { id, promise });
            }

            return promise;
        },
        // isConnected is the only reactive dep here; socket/windowId are accessed
        // via stable refs to avoid re-creating the callback on every render.
        [isConnected],
    );

    return { sendRpcRequest, handleRpcResponse, handleRpcException };
}
