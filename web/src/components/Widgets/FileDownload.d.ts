import type {ComponentType} from 'react';

export interface FileDownloadProps {
    docId: string;
    onDownloadStart?: (() => void) | null;
    onDownloadComplete?: (() => void) | null;
    onError?: ((err: Error | string) => void) | null;
    altDownloadName?: string | null;
}

export declare const FileDownload: ComponentType<FileDownloadProps>;
