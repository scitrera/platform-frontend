export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastApi {
    addToast: (message: string, type?: ToastType, duration?: number) => void;
    removeToast: (id: string) => void;
}

export declare function useToasts(): ToastApi;
