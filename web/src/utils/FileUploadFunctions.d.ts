export interface UploadFileArgs {
    file: File;
    threadId?: string | null;
    onStart?: (file: File) => void;
    onProgress?: (key: unknown, percent: number) => void;
    onFinish?: (key: string | null, err: Error | null) => void;
    signal?: AbortSignal;
}

export interface UploadCompleteOptions {
    visibility?: 'workspace' | 'private';
    // Commit the blob without ingesting it into the knowledge base (chat
    // attachments set this; Library/ingest uploads leave it false).
    skipIngest?: boolean;
}

export interface FileUploader {
    uploadFile: (args: UploadFileArgs) => Promise<void>;
    notifyUploadComplete: (
        refs: Array<string | { vfs_ref: string }>,
        opts?: UploadCompleteOptions,
    ) => void;
}

export declare function useFileUploader(workspaceId: string | null): FileUploader;
