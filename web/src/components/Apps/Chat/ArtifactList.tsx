import React, {useEffect, useMemo} from 'react';
import {FileIcon, FileText, FileCode, Image as ImageIcon, Package} from 'lucide-react';
import {cn, timestampToString} from '@/lib/utils';
import type {Artifact} from '@/utils/artifactExtractor';

// Shared artifacts list body (header + scrollable rows), reused by the unified
// right sidebar (fullscreen) and the sidebar-mode popout so the two never drift.

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']);
const CODE_EXTS = new Set(['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'json', 'yaml', 'yml', 'toml', 'sh', 'bash', 'md', 'html', 'css']);
const TEXT_EXTS = new Set(['txt', 'csv', 'log', 'xml']);

function getExtension(label: string): string {
    const base = label.split('/').pop() || label;
    return base.split('.').pop()?.toLowerCase() ?? '';
}

function ArtifactIcon({artifact, size = 16}: {artifact: Artifact; size?: number}) {
    const ext = getExtension(artifact.label);
    const isImage = artifact.kind === 'image' || (artifact.mime?.startsWith('image/') ?? false) || IMAGE_EXTS.has(ext);
    if (isImage) return <ImageIcon size={size} className="text-blue-500 flex-shrink-0"/>;
    if (CODE_EXTS.has(ext)) return <FileCode size={size} className="text-purple-500 flex-shrink-0"/>;
    if (TEXT_EXTS.has(ext)) return <FileText size={size} className="text-gray-500 flex-shrink-0"/>;
    return <FileIcon size={size} className="text-gray-500 flex-shrink-0"/>;
}

function InlineThumb({dataBase64, mime, label}: {dataBase64: string; mime?: string; label: string}) {
    const blobUrl = useMemo(() => {
        try {
            const binary = atob(dataBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], {type: mime || 'application/octet-stream'});
            return URL.createObjectURL(blob);
        } catch {
            return null;
        }
    }, [dataBase64, mime]);

    useEffect(() => {
        return () => {
            if (blobUrl) URL.revokeObjectURL(blobUrl);
        };
    }, [blobUrl]);

    if (!blobUrl) return null;
    return (
        <img
            src={blobUrl}
            alt={label}
            className="w-10 h-10 object-cover rounded border border-gray-200 flex-shrink-0"
        />
    );
}

function ArtifactRow({artifact, onClick}: {artifact: Artifact; onClick: () => void}) {
    const showThumb = artifact.kind === 'image' && artifact.dataBase64;
    const sourceLabel = artifact.source === 'user' ? 'Uploaded' : 'Generated';
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full flex items-center gap-2 p-2 mb-1 rounded-lg cursor-pointer text-left hover:bg-gray-100 text-gray-700 transition-colors duration-200 group"
            title={`Jump to message — ${artifact.label}`}
        >
            {showThumb ? (
                <InlineThumb dataBase64={artifact.dataBase64!} mime={artifact.mime} label={artifact.label}/>
            ) : (
                <div className="w-10 h-10 rounded border border-gray-200 bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <ArtifactIcon artifact={artifact} size={18}/>
                </div>
            )}
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{artifact.label}</div>
                <div className="text-xs text-gray-500 truncate">
                    <span className={cn(
                        'inline-block px-1 py-0.5 rounded text-[10px] mr-1 align-middle',
                        artifact.source === 'user' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700',
                    )}>
                        {sourceLabel}
                    </span>
                    {artifact.timestamp ? timestampToString(artifact.timestamp) : ''}
                </div>
            </div>
        </button>
    );
}

export interface ArtifactListBodyProps {
    artifacts: Artifact[];
    onArtifactSelect: (messageId: string) => void;
}

/** Header + scrollable artifact rows. Fills its parent (h-full flex column). */
export function ArtifactListBody({artifacts, onArtifactSelect}: ArtifactListBodyProps) {
    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center gap-2">
                <Package size={16} className="text-gray-500"/>
                <h3 className="text-sm font-semibold text-gray-700">
                    Artifacts {artifacts.length > 0 && (
                        <span className="text-gray-400 font-normal">({artifacts.length})</span>
                    )}
                </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                {artifacts.length === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-8 px-3">
                        No artifacts yet. Uploaded files and generated content will appear here.
                    </div>
                ) : (
                    artifacts.map(artifact => (
                        <ArtifactRow
                            key={artifact.id}
                            artifact={artifact}
                            onClick={() => onArtifactSelect(artifact.messageId)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
