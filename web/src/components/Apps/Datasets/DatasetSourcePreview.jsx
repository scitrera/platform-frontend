import React from 'react';
import {
    Database,
    Regex,
    FolderOpen,
    Globe
} from 'lucide-react';
import Spreadsheet from '../../Widgets/Spreadsheet.jsx';
import DocumentImageViewer from '../../Widgets/DocumentImageViewer.jsx';

const SOURCE_TYPES = {
    FILE: 'file',
    GLOB: 'glob',
    INTERNAL: 'internal', // dataset reference
    WEB: 'web'
};

// Utility: crude type detection by extension
export const detectFileKind = (nameOrPath = '') => {
    const lower = (nameOrPath || '').toLowerCase();
    if (
        lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.xlsx') || lower.endsWith('.xls') ||
        lower.endsWith('.parquet')
    ) {
        return 'table';
    }
    if (
        lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.pptx') || lower.endsWith('.doc') ||
        lower.endsWith('.ppt') || lower.endsWith('.txt') || lower.endsWith('.rtf') || lower.endsWith('.odt')
    ) {
        return 'document';
    }
    if (
        lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') ||
        lower.endsWith('.webp') || lower.endsWith('.bmp') || lower.endsWith('.tiff') || lower.endsWith('.svg') ||
        lower.endsWith('.tif') || lower.endsWith('.heic')
    ) {
        return 'image';
    }
    return 'unknown';
};

export default function DatasetSourcePreview({
                                                 selectedSource,
                                                 fetchTableMeta,
                                                 fetchTableRows,
                                                 fetchDocPageUrls
                                             }) {
    if (!selectedSource) return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
            <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                <Database className="w-8 h-8 text-slate-300"/>
            </div>
            <div className="font-medium">Select a source to preview</div>
        </div>
    );
    const {type, payload} = selectedSource;
    if (type === SOURCE_TYPES.FILE) {
        const kind = payload.kind || detectFileKind(payload.path || selectedSource.label);
        if (kind === 'table') {
            return (
                <div className="h-full min-h-0 overflow-hidden flex flex-col bg-white">
                    <Spreadsheet
                        showToolbar={false}
                        showFooter={false}
                        // title={`Preview: ${selectedSource.label}`}
                        readOnly={true}
                        maxHeight={'100%'}
                        onFetchMeta={async () => {
                            if (fetchTableMeta) return fetchTableMeta(selectedSource);
                            // Demo fallback
                            return {
                                columns: [
                                    {key: 'col1', label: 'Column 1', width: 160},
                                    {key: 'col2', label: 'Column 2', width: 160},
                                    {key: 'col3', label: 'Column 3', width: 160},
                                ],
                                totalRows: 20,
                            };
                        }}
                        onFetchRows={async ({offset, limit}) => {
                            if (fetchTableRows) return fetchTableRows(selectedSource, {offset, limit});
                            // Demo rows
                            const rows = [];
                            for (let i = offset; i < Math.min(offset + limit, 20); i++) {
                                rows.push({id: i, col1: `R${i + 1}C1`, col2: `R${i + 1}C2`, col3: `R${i + 1}C3`});
                            }
                            return rows;
                        }}
                    />
                </div>
            );
        }
        if (kind === 'document') {
            const docId = payload.docId || payload.path;
            return (
                <div className="h-full min-h-0 overflow-hidden flex flex-col bg-slate-100">
                    <DocumentImageViewer
                        docId={docId}
                        totalPages={10}
                        docTitle={selectedSource.label}
                        fetchPageUrls={async (docId, pages) => {
                            if (fetchDocPageUrls) return fetchDocPageUrls(docId, pages);
                            return [];
                        }}
                    />
                </div>
            );
        }
        if (kind === 'image') {
            const srcUrl = payload.url;
            if (!srcUrl) return <div className="p-12 text-center text-slate-400">No image preview available.</div>;
            return (
                <div className="w-full h-full flex items-center justify-center bg-slate-50/50 p-8">
                    <div
                        className="bg-white p-2 rounded shadow-sm border border-slate-200 max-w-full max-h-full overflow-hidden flex items-center justify-center">
                        <img src={srcUrl} alt={selectedSource.label} className="max-w-full max-h-full object-contain"/>
                    </div>
                </div>
            );
        }
        return <div className="p-12 text-center text-slate-400">No preview available for this file type.</div>;
    }
    if (type === SOURCE_TYPES.WEB) {
        const url = payload.url;
        return (
            <div className="w-full h-full flex flex-col bg-white">
                <div
                    className="px-4 py-2 text-sm border-b border-slate-200 bg-slate-50 flex items-center text-slate-600">
                    <Globe className="w-4 h-4 mr-2 text-slate-400"/>
                    {url}
                </div>
                <iframe src={url} title={url} className="w-full flex-1 border-none bg-white"/>
            </div>
        );
    }
    if (type === SOURCE_TYPES.GLOB) {
        return (
            <div className="p-8 text-sm text-slate-600 flex flex-col items-center justify-center h-full">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <Regex className="w-6 h-6 text-slate-400"/>
                </div>
                <div className="mb-2 font-medium text-lg text-slate-800">Glob Pattern Source</div>
                <div className="mb-4 font-mono bg-slate-100 px-3 py-1 rounded text-slate-700">{payload.pattern}</div>
                <div className="text-slate-400 max-w-md text-center">
                    Files matching this pattern will be automatically included in the dataset.
                    Preview via FileBrowser could be displayed here.
                </div>
            </div>
        );
    }
    if (type === SOURCE_TYPES.INTERNAL) {
        return (
            <div className="p-8 text-sm text-slate-600 flex flex-col items-center justify-center h-full">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <FolderOpen className="w-6 h-6 text-slate-400"/>
                </div>
                <div className="mb-2 font-medium text-lg text-slate-800">Internal Dataset Link</div>
                <div className="text-slate-500">
                    Referenced dataset ID: <span
                    className="font-mono font-medium text-slate-700">{payload.datasetId}</span>
                </div>
            </div>
        );
    }
    return null;
}
