/**
 * Minimal, dependency-free CSV/TSV parser for the document-viewer preview.
 *
 * Handles the common RFC-4180 shape the model tends to emit: quoted fields,
 * escaped quotes (``""``), embedded commas/newlines inside quotes, and both
 * ``\n`` and ``\r\n`` line endings. The first row is treated as the header.
 *
 * This is a preview-grade parser (not a full streaming CSV engine); it loads
 * the whole text into memory, which is fine for the small generated files the
 * viewer targets. Callers should size-cap the input before parsing.
 */

export interface ParsedCsv {
    headers: string[];
    rows: string[][];
}

/**
 * Parse CSV (or TSV when ``delimiter`` is a tab) text into headers + rows.
 * Never throws on malformed input — it does a best-effort field split.
 */
export function parseCsv(text: string, delimiter = ','): ParsedCsv {
    const records: string[][] = [];
    let field = '';
    let record: string[] = [];
    let inQuotes = false;
    let sawAny = false;

    const pushField = () => {
        record.push(field);
        field = '';
    };
    const pushRecord = () => {
        pushField();
        records.push(record);
        record = [];
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        sawAny = true;
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++; // consume the escaped quote
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
        } else if (ch === delimiter) {
            pushField();
        } else if (ch === '\n') {
            pushRecord();
        } else if (ch === '\r') {
            // Swallow CR; the following LF (if any) closes the record.
            if (text[i + 1] === '\n') {
                i++;
            }
            pushRecord();
        } else {
            field += ch;
        }
    }
    // Flush the trailing field/record unless the input ended exactly on a
    // newline (which already pushed the record) or was empty.
    if (sawAny && (field.length > 0 || record.length > 0)) {
        pushRecord();
    }

    if (records.length === 0) return {headers: [], rows: []};

    const headers = records[0];
    const rows = records.slice(1);
    // Drop a trailing all-empty record (common when the file ends with a newline
    // that produced a single empty field).
    if (rows.length > 0) {
        const last = rows[rows.length - 1];
        if (last.length === 1 && last[0] === '') rows.pop();
    }
    return {headers, rows};
}

/** Pick a delimiter from the filename/mime (``.tsv`` → tab, else comma). */
export function delimiterFor(fileName?: string | null, mime?: string | null): string {
    const n = (fileName || '').toLowerCase();
    if (n.endsWith('.tsv') || (mime || '').includes('tab-separated')) return '\t';
    return ',';
}
