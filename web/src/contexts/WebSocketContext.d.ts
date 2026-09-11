import type {Context} from 'react';

export interface WebSocketContextValue {
    socket: unknown;
    isConnected: boolean;
    isAuthenticated: boolean;
    sendMessage: (type: string, payload: unknown) => void;
    sendWsRequest: (type: string, payload: unknown) => void;
    error: unknown;
    connect: () => void;
    disconnect: () => void;
    dynamicJSXContent: Record<string, unknown>;
    sendRpcRequest: <T = unknown>(type: string, payload: unknown, timeout?: number) => Promise<T>;
    /** @param label identifies the subscriber in the listener debug log. */
    registerAppListener: (
        appId: string,
        handler: (msg: unknown) => void,
        label?: string,
    ) => () => void;
    checkAuthentication: () => Promise<void>;
    backendVersion: string;
}

/** Stable for the life of a socket — safe in an effect's dependency array. */
export type WebSocketApiValue = Pick<
    WebSocketContextValue,
    'socket' | 'sendMessage' | 'sendWsRequest' | 'sendRpcRequest'
    | 'registerAppListener' | 'connect' | 'disconnect' | 'checkAuthentication'
>;

/** Connection + auth state. */
export type WebSocketStatusValue = Pick<
    WebSocketContextValue,
    'isConnected' | 'isAuthenticated' | 'error' | 'backendVersion'
>;

/** Per-message dynamic JSX payloads — the fastest-changing slice. */
export type WebSocketJsxValue = Pick<WebSocketContextValue, 'dynamicJSXContent'>;

export declare const WebSocketContext: Context<WebSocketContextValue | null>;
export declare const WebSocketApiContext: Context<WebSocketApiValue | null>;
export declare const WebSocketStatusContext: Context<WebSocketStatusValue | null>;
export declare const WebSocketJsxContext: Context<WebSocketJsxValue | null>;
export declare const WebSocketProvider: React.FC<{children: React.ReactNode}>;
