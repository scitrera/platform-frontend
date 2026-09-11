/**
 * Pull a flat list of right-rail "artifacts" (downloadable / viewable
 * blocks) out of the spec ChatMessage stream. Used by the artifacts
 * sidebar (right rail) and the artifacts popout to surface every image /
 * file / dynamic block the assistant + user have exchanged.
 *
 * Phase 4: consumes the universal messaging-spec ``ChatMessage`` shape
 * directly. Native spec parts (``image``, ``file``) are surfaced
 * first-class; legacy-style dynamic blocks (``dynamic`` parts with kind
 * 'image' / 'file' / custom) are unwrapped into the same Artifact shape
 * for compatibility with the existing sidebar UI.
 */
import type {
    ChatMessage as SpecChatMessage,
    ContentPart,
    DynamicPart,
    FilePart,
    ImagePart,
} from '@scitrera/messaging-spec';
import {specMessageTimestamp} from './messaging/specAdapters';

export interface Artifact {
    id: string;
    messageId: string;
    timestamp: number;
    source: 'user' | 'agent';
    kind: string;
    mime?: string;
    label: string;
    docId?: string | null;
    dataBase64?: string | null;
}

interface DynamicBlock {
    kind?: string;
    mime?: string;
    filename?: string;
    data_base64?: string;
    doc_id?: string;
    data?: DynamicBlock;
}

const sourceFor = (msg: SpecChatMessage): 'user' | 'agent' =>
    msg.role === 'user' ? 'user' : 'agent';

/**
 * Derive a user-friendly name from a vfs_ref when no explicit file_name /
 * alt_text is available: strip any ``scheme://`` prefix and query/fragment,
 * then take the last path segment (URL-decoded). Falls back to the raw ref
 * when it isn't path-like (e.g. an opaque doc id). Never throws.
 */
export function friendlyRefName(ref: string | null | undefined): string | null {
    if (!ref) return null;
    let s = ref.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    const qf = s.search(/[?#]/);
    if (qf >= 0) s = s.slice(0, qf);
    s = s.replace(/\/+$/, '');
    const seg = s.split('/').pop() || s;
    if (!seg) return ref;
    try {
        return decodeURIComponent(seg) || ref;
    } catch {
        return seg;
    }
}

export function extractArtifacts(messages: SpecChatMessage[]): Artifact[] {
    const out: Artifact[] = [];
    if (!Array.isArray(messages)) return out;

    for (const msg of messages) {
        if (!msg) continue;
        const ts = specMessageTimestamp(msg);
        const source = sourceFor(msg);

        msg.content.forEach((part: ContentPart, idx: number) => {
            const t = part.type;
            if (t === 'image') {
                const p = part as ImagePart;
                const docId = p.vfs_ref || null;
                const label = p.alt_text || friendlyRefName(docId) || `image ${idx}`;
                out.push({
                    id: `${msg.id}:img:${docId || idx}`,
                    messageId: msg.id,
                    timestamp: ts,
                    source,
                    kind: 'image',
                    mime: p.mime ?? undefined,
                    label,
                    docId,
                    dataBase64: extractBase64FromDataUri(p.data_uri),
                });
                return;
            }
            if (t === 'file') {
                const p = part as FilePart;
                const docId = p.vfs_ref || null;
                const label = p.file_name || friendlyRefName(docId) || `file ${idx}`;
                out.push({
                    id: `${msg.id}:fl:${docId || idx}`,
                    messageId: msg.id,
                    timestamp: ts,
                    source,
                    kind: 'file',
                    mime: p.mime ?? undefined,
                    label,
                    docId,
                    dataBase64: null,
                });
                return;
            }
            if (t === 'dynamic') {
                const p = part as DynamicPart;
                // Unwrap defensively — historical payloads ship as either
                // FLAT {kind, mime, doc_id, filename, data_base64} or
                // WRAPPED {data: {...}}.
                const block = (p.payload && typeof p.payload === 'object'
                    ? (p.payload as DynamicBlock)
                    : ({} as DynamicBlock));
                const data: DynamicBlock = (block.data && typeof block.data === 'object')
                    ? (block.data as DynamicBlock)
                    : block;
                const kind = p.kind || data.kind;
                if (!kind) return;
                out.push({
                    id: `${msg.id}:dyn:${data.doc_id || data.filename || idx}`,
                    messageId: msg.id,
                    timestamp: ts,
                    source,
                    kind,
                    mime: data.mime,
                    label: data.filename || friendlyRefName(data.doc_id) || `${kind} block`,
                    docId: data.doc_id ?? null,
                    dataBase64: data.data_base64 ?? null,
                });
                return;
            }
        });
    }
    return out;
}

function extractBase64FromDataUri(dataUri: string | null | undefined): string | null {
    if (!dataUri) return null;
    const comma = dataUri.indexOf(',');
    if (comma < 0) return null;
    return dataUri.slice(comma + 1) || null;
}
