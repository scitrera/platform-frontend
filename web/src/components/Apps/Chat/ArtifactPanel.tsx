import React, { useState } from 'react';
import { Download, FileIcon, FileText, FileCode, Image } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Artifact {
    name: string;
    url: string;
    type?: string;
}

interface ArtifactPanelProps {
    artifacts: Artifact[];
    threadId: string;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']);
const CODE_EXTENSIONS = new Set(['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'json', 'yaml', 'yml', 'toml', 'sh', 'bash', 'md', 'html', 'css']);
const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'log', 'xml']);

function getExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() ?? '';
}

function isImage(artifact: Artifact): boolean {
    const ext = getExtension(artifact.name);
    return IMAGE_EXTENSIONS.has(ext) || (artifact.type?.startsWith('image/') ?? false);
}

function ArtifactIcon({ artifact }: { artifact: Artifact }) {
    const ext = getExtension(artifact.name);
    if (IMAGE_EXTENSIONS.has(ext)) return <Image size={14} className="text-blue-400" />;
    if (CODE_EXTENSIONS.has(ext)) return <FileCode size={14} className="text-purple-400" />;
    if (TEXT_EXTENSIONS.has(ext)) return <FileText size={14} className="text-gray-400" />;
    return <FileIcon size={14} className="text-gray-400" />;
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
    const [imgError, setImgError] = useState(false);
    const showThumbnail = isImage(artifact) && !imgError;

    return (
        <div className={cn(
            'flex-shrink-0 rounded-lg border border-gray-200 bg-white overflow-hidden',
            'hover:border-gray-300 hover:shadow-sm transition-all',
            showThumbnail ? 'w-28' : 'w-36'
        )}>
            {showThumbnail && (
                <div className="w-full h-16 bg-gray-50 overflow-hidden">
                    <img
                        src={artifact.url}
                        alt={artifact.name}
                        className="w-full h-full object-cover"
                        onError={() => setImgError(true)}
                    />
                </div>
            )}
            <div className="p-2 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                    <ArtifactIcon artifact={artifact} />
                    <span
                        className="text-[11px] text-gray-700 truncate font-medium"
                        title={artifact.name}
                    >
                        {artifact.name}
                    </span>
                </div>
                <a
                    href={artifact.url}
                    download={artifact.name}
                    className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                    title={`Download ${artifact.name}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Download size={12} />
                </a>
            </div>
        </div>
    );
}

export function ArtifactPanel({ artifacts, threadId }: ArtifactPanelProps) {
    if (!artifacts || artifacts.length === 0) return null;

    return (
        <div className="mt-2 border-t border-gray-100 pt-2">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 font-medium">
                {artifacts.length === 1 ? '1 artifact' : `${artifacts.length} artifacts`}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-200">
                {artifacts.map((artifact, index) => (
                    <ArtifactCard key={`${threadId}-${artifact.name}-${index}`} artifact={artifact} />
                ))}
            </div>
        </div>
    );
}
