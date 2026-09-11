import {buildMetaChips, type ChipTone, type FrontmatterValue} from './utils';

const TONE_CLASSES: Record<ChipTone, string> = {
    default: 'bg-gray-100 text-gray-600 border-gray-200',
    accent: 'bg-green-50 text-green-700 border-green-200',
    muted: 'bg-gray-50 text-gray-400 border-gray-100',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
};

interface ArticleMetaProps {
    data: Record<string, FrontmatterValue>;
}

/**
 * Render an article's frontmatter as a compact row of chips instead of raw
 * YAML text. Redundant fields (title/type/timestamp/description) are dropped
 * by buildMetaChips; renders nothing when there is nothing worth showing.
 */
export function ArticleMeta({data}: ArticleMetaProps) {
    const chips = buildMetaChips(data);
    if (chips.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {chips.map(chip => (
                <span
                    key={chip.key}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${TONE_CLASSES[chip.tone]}`}
                >
                    {chip.label && <span className="opacity-60">{chip.label}</span>}
                    <span className="font-medium">{chip.value}</span>
                </span>
            ))}
        </div>
    );
}
