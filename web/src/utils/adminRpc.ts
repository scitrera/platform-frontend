import {ADMIN_RPC} from '../constants/WebSocketConstants.jsx';

type SendRpcRequest = <T = unknown>(
    type: string,
    payload: unknown,
    timeout?: number,
) => Promise<T>;

interface AdminRpcEnvelope<T> {
    ok: boolean;
    result?: T;
    error?: string;
}

export async function adminRpc<T>(
    sendRpcRequest: SendRpcRequest,
    op: string,
    args: Record<string, unknown> = {},
): Promise<T> {
    const envelope = await sendRpcRequest<AdminRpcEnvelope<T>>(ADMIN_RPC.CALL, {op, args});
    if (!envelope.ok) {
        throw new Error(envelope.error || 'admin rpc failed');
    }
    return envelope.result as T;
}
