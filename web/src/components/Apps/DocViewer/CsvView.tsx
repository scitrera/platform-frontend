/**
 * CSV/TSV sub-view for the document viewer. Parses the raw text client-side
 * and feeds the existing virtualized ``Spreadsheet`` widget through its
 * callback API (read-only), so large generated CSVs scroll smoothly.
 */
import {useCallback, useMemo, type ComponentType} from 'react';
// Spreadsheet is an untyped .jsx widget; cast it to a prop-agnostic component
// so TSX prop-passing typechecks.
import SpreadsheetRaw from '@/components/Widgets/Spreadsheet.jsx';
import {parseCsv, delimiterFor} from '@/utils/parseCsv';

const Spreadsheet = SpreadsheetRaw as unknown as ComponentType<Record<string, unknown>>;

interface CsvViewProps {
    text: string;
    fileName?: string | null;
    mime?: string | null;
}

interface CsvColumn {
    key: string;
    label: string;
    sortable: boolean;
}

export default function CsvView({text, fileName, mime}: CsvViewProps) {
    const {columns, rows} = useMemo(() => {
        const parsed = parseCsv(text, delimiterFor(fileName, mime));
        const cols: CsvColumn[] = parsed.headers.map((h, i) => ({
            key: `c${i}`,
            label: h || `Column ${i + 1}`,
            sortable: false,
        }));
        const objs = parsed.rows.map((r, idx) => {
            const o: Record<string, unknown> = {id: idx};
            parsed.headers.forEach((_, i) => {
                o[`c${i}`] = r[i] ?? '';
            });
            return o;
        });
        return {columns: cols, rows: objs};
    }, [text, fileName, mime]);

    const onFetchMeta = useCallback(
        async () => ({columns, totalRows: rows.length}),
        [columns, rows],
    );
    const onFetchRows = useCallback(
        async ({offset, limit}: {offset: number; limit: number}) => rows.slice(offset, offset + limit),
        [rows],
    );

    if (columns.length === 0) {
        return (
            <div className="p-8 text-center text-sm text-gray-400">
                This file has no rows to display.
            </div>
        );
    }

    return (
        <Spreadsheet
            onFetchMeta={onFetchMeta}
            onFetchRows={onFetchRows}
            title={fileName || 'CSV'}
            readOnly
            rowKey="id"
            fullHeight
            showToolbar={false}
        />
    );
}
