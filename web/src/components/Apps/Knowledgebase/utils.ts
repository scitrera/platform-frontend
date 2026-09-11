import type {KbArticle} from '@/types/knowledgebase';

// Hash-href schemes used to carry KB-internal semantics through the markdown
// renderer to the custom link component (see ArticleView). Kept as hrefs (not
// bespoke tokens) so they survive the markdown → HTML pipeline untouched.
export const KB_LINK_HREF_PREFIX = '#kb-link/';
export const KB_CITE_HREF_PREFIX = '#kb-cite/';

/**
 * Transform Obsidian-style wikilinks into markdown links whose href preserves
 * the raw OKF target (e.g. `communities/community-0`, `entities/response`), so
 * the link component can resolve it against the loaded article list at render
 * time. The target is URI-encoded to survive as a single href token.
 *
 * Handles [[target|display]] and [[target]] forms.
 */
export function rewriteWikilinks(content: string): string {
    return content.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
        const pipeIdx = inner.indexOf('|');
        const target = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).trim();
        const display = (pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : inner).trim();
        return `[${display}](${KB_LINK_HREF_PREFIX}${encodeURIComponent(target)})`;
    });
}

/**
 * Turn inline numbered citation markers ([m12], and runs like [m12][m16]) into
 * links to a citation-anchor href, so the renderer can style them as small,
 * muted reference markers. Skips the bold Key-Memories labels (`**[m1]**`),
 * which are definitions rather than references.
 */
export function rewriteCitations(content: string): string {
    return content.replace(/(?<!\*)\[m(\d+)\]/g, (_m, n: string) => `[m${n}](${KB_CITE_HREF_PREFIX}${n})`);
}

/**
 * Resolve an OKF wikilink target to a real article id from the loaded article
 * list, or null when nothing matches. Community targets (`communities/<id>`)
 * map straight to the article id; entity targets (`entities/<slug>`) map by the
 * entity article's metadata slug, with an id-prefix fallback.
 */
export function resolveKbLink(target: string, articles: KbArticle[]): string | null {
    const slash = target.indexOf('/');
    const folder = slash >= 0 ? target.slice(0, slash) : '';
    const name = slash >= 0 ? target.slice(slash + 1) : target;

    if (folder === 'communities' && articles.some(a => a.id === name)) {
        return name;
    }
    if (folder === 'entities') {
        const bySlug = articles.find(a => a.article_type === 'entity' && a.metadata?.slug === name);
        if (bySlug) return bySlug.id;
        const byId = articles.find(a => a.article_type === 'entity' && a.id.startsWith(`entity-${name}-ent_`));
        if (byId) return byId.id;
    }
    // Generic fallbacks: a bare or fully-qualified article id.
    if (articles.some(a => a.id === target)) return target;
    if (name !== target && articles.some(a => a.id === name)) return name;
    return null;
}

export function formatDateTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

// ---------------------------------------------------------------------------
// Article frontmatter
//
// KB article `content_md` leads with a YAML frontmatter block (OKF properties)
// that must NOT reach the markdown renderer as body text. We parse it out here
// (dependency-free — the block is always flat scalars + inline lists) so the
// view can render selected fields as chips and feed only the body to markdown.
// ---------------------------------------------------------------------------

export type FrontmatterScalar = string | number | boolean;
export type FrontmatterValue = FrontmatterScalar | FrontmatterScalar[];

export interface ParsedArticle {
    data: Record<string, FrontmatterValue>;
    body: string;
}

function coerceScalar(raw: string): FrontmatterScalar {
    const s = raw.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
    }
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s !== '' && !Number.isNaN(Number(s))) return Number(s);
    return s;
}

function parseValue(raw: string): FrontmatterValue {
    const s = raw.trim();
    if (s.startsWith('[') && s.endsWith(']')) {
        // Split on commas that are not inside quotes: match quoted or bare items.
        const items = s.slice(1, -1).match(/"[^"]*"|'[^']*'|[^,]+/g) ?? [];
        return items.map(i => coerceScalar(i)).filter(v => v !== '');
    }
    return coerceScalar(s);
}

/**
 * Split a KB article's markdown into its parsed YAML frontmatter and the
 * remaining body. If there is no leading `---` block, `data` is empty and
 * `body` is the input unchanged.
 */
export function parseFrontmatter(md: string): ParsedArticle {
    const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return {data: {}, body: md};

    const data: Record<string, FrontmatterValue> = {};
    for (const line of match[1].split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf(':');
        if (idx <= 0) continue;
        const key = trimmed.slice(0, idx).trim();
        data[key] = parseValue(trimmed.slice(idx + 1));
    }
    // Drop blank lines left between the closing `---` and the first heading.
    return {data, body: md.slice(match[0].length).replace(/^(?:\r?\n)+/, '')};
}

export type ChipTone = 'default' | 'accent' | 'muted' | 'warn';

export interface MetaChip {
    key: string;
    label?: string;
    value: string;
    tone: ChipTone;
}

// Redundant with the header (title/badge/timestamp) or the body summary
// (description) — never surface these as chips.
const HIDDEN_FRONTMATTER_KEYS = new Set(['type', 'title', 'description', 'timestamp']);

function asArray(value: FrontmatterValue): FrontmatterScalar[] {
    return Array.isArray(value) ? value : [value];
}

const pct = (v: FrontmatterValue) => `${Math.round(Number(v) * 100)}%`;
const humanize = (key: string) => key.replace(/_/g, ' ');
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Turn parsed frontmatter into an ordered, display-ready set of chips, applying
 * per-field formatting and dropping redundant/empty values. Unknown keys fall
 * through to a humanized label so new frontmatter fields still surface.
 */
export function buildMetaChips(data: Record<string, FrontmatterValue>): MetaChip[] {
    const chips: MetaChip[] = [];
    for (const [key, value] of Object.entries(data)) {
        if (HIDDEN_FRONTMATTER_KEYS.has(key)) continue;
        if (value === '' || value === null || value === undefined) continue;
        if (Array.isArray(value) && value.length === 0) continue;

        switch (key) {
            case 'entity_type':
                chips.push({key, value: titleCase(String(value)), tone: 'accent'});
                break;
            case 'confidence':
                chips.push({key, label: 'Confidence', value: pct(value), tone: 'default'});
                break;
            case 'citation_coverage':
                chips.push({key, label: 'Citations', value: pct(value), tone: 'default'});
                break;
            case 'cohesion':
                chips.push({key, label: 'Cohesion', value: Number(value).toFixed(2), tone: 'default'});
                break;
            case 'member_count':
                chips.push({key, label: 'Members', value: String(value), tone: 'default'});
                break;
            case 'related_count':
                if (Number(value) > 0) chips.push({key, label: 'Related', value: String(value), tone: 'default'});
                break;
            case 'aliases':
                chips.push({key, label: 'aka', value: asArray(value).join(', '), tone: 'muted'});
                break;
            case 'contradicted_by':
                chips.push({key, label: '⚠ Contradicted by', value: String(asArray(value).length), tone: 'warn'});
                break;
            case 'tags': {
                const tags = asArray(value).map(String);
                for (const t of tags.filter(t => !t.startsWith('doc:'))) {
                    chips.push({key: `tag:${t}`, value: humanize(t), tone: 'muted'});
                }
                const docs = tags.filter(t => t.startsWith('doc:')).length;
                if (docs) chips.push({key: 'source-docs', label: 'Source docs', value: String(docs), tone: 'muted'});
                break;
            }
            default:
                chips.push({
                    key,
                    label: humanize(key),
                    value: Array.isArray(value) ? value.join(', ') : String(value),
                    tone: 'default',
                });
        }
    }
    return chips;
}
