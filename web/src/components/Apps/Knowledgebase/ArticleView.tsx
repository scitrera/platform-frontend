import {useCallback, useEffect, useMemo, useState, type ComponentProps} from 'react';
import {ChevronLeft} from 'lucide-react';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useKnowledgebaseState} from '@/hooks/useKnowledgebaseState';
import {SciMarkdown} from '../Chat/SciMarkdown';
import {CHAT_UI_CONSTANTS} from '@/constants/AppConstants';
import {
    formatDateTime,
    KB_CITE_HREF_PREFIX,
    KB_LINK_HREF_PREFIX,
    parseFrontmatter,
    resolveKbLink,
    rewriteCitations,
    rewriteWikilinks,
} from './utils';
import {ArticleMeta} from './ArticleMeta';
import type {KbArticle, KbArticleType} from '@/types/knowledgebase';

const TYPE_BADGE_CLASSES: Record<KbArticleType, string> = {
    community: 'bg-blue-100 text-blue-700 border-blue-200',
    entity: 'bg-green-100 text-green-700 border-green-200',
    index: 'bg-amber-100 text-amber-700 border-amber-200',
};

const TYPE_LABELS: Record<KbArticleType, string> = {
    community: 'Community',
    entity: 'Entity',
    index: 'Overview',
};

function ArticleBadge({type}: {type: KbArticleType}) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${TYPE_BADGE_CLASSES[type]}`}>
            {TYPE_LABELS[type]}
        </span>
    );
}

interface ArticleViewProps {
    articleId: string;
}

export function ArticleView({articleId}: ArticleViewProps) {
    const {loadArticle, articleCache, articles} = useKnowledgebaseState();
    const updateAppUrl = useAppPanelStore(s => s.updateAppUrl);

    const [article, setArticle] = useState<KbArticle | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function fetch() {
            setLoading(true);
            const result = await loadArticle(articleId);
            if (!cancelled) {
                setArticle(result);
                setLoading(false);
            }
        }

        // Use cached version immediately if available
        if (articleCache[articleId]?.content_md !== undefined) {
            setArticle(articleCache[articleId]);
            setLoading(false);
        } else {
            fetch();
        }

        return () => {
            cancelled = true;
        };
    }, [articleId, loadArticle, articleCache]);

    // Ordered member memory ids: member_ids[n-1] is the memory cited by [m{n}].
    // Absent on pre-member_ids articles → citations stay non-clickable.
    const memberIds = useMemo(
        () => (article?.metadata?.member_ids as string[] | undefined) ?? [],
        [article],
    );

    // Custom renderer for markdown links. KB articles carry three kinds of
    // links, none of which should get the renderer's default external-link
    // treatment (new tab + warning icon):
    //   - citation markers  (#kb-cite/N)  → small superscript; links to the cited
    //                                        memory when its id is known
    //   - internal wikilinks (#kb-link/…) → resolve to an article, navigate in-app
    //   - anything else                   → a genuine external link
    const renderLink = useCallback(
        ({href = '', children}: ComponentProps<'a'> & {node?: unknown}) => {
            if (href.startsWith(KB_CITE_HREF_PREFIX)) {
                const n = parseInt(href.slice(KB_CITE_HREF_PREFIX.length), 10);
                const memId = memberIds[n - 1];
                const supClass = 'ml-0.5 align-super text-[0.65em] font-normal';
                if (memId) {
                    return (
                        <sup className={supClass}>
                            <a
                                href={`#memory/${memId}`}
                                onClick={e => {
                                    e.preventDefault();
                                    updateAppUrl({path: `memory/${memId}`});
                                }}
                                className="text-blue-500 hover:underline cursor-pointer"
                            >
                                {children}
                            </a>
                        </sup>
                    );
                }
                return <sup className={`${supClass} text-gray-400`}>{children}</sup>;
            }
            if (href.startsWith(KB_LINK_HREF_PREFIX)) {
                const target = decodeURIComponent(href.slice(KB_LINK_HREF_PREFIX.length));
                const id = resolveKbLink(target, articles);
                if (id) {
                    // Prefer the resolved article's current title over the markdown's
                    // display text, so e.g. community connections read "Trimodal
                    // Architecture…" instead of "Community 12".
                    const resolvedTitle = articles.find(a => a.id === id)?.title;
                    return (
                        <a
                            href={`#articles/${id}`}
                            onClick={e => {
                                e.preventDefault();
                                updateAppUrl({path: `articles/${id}`});
                            }}
                            className="text-blue-600 hover:underline cursor-pointer"
                        >
                            {resolvedTitle ?? children}
                        </a>
                    );
                }
                // Unresolved internal link → plain muted text, never a broken link.
                return <span className="text-gray-500">{children}</span>;
            }
            return (
                <a href={href} target="_blank" rel="noreferrer noopener" className="text-blue-600 hover:underline">
                    {children}
                </a>
            );
        },
        [articles, memberIds, updateAppUrl],
    );

    const handleBack = () => {
        updateAppUrl({path: 'articles'});
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Loading article...
            </div>
        );
    }

    if (!article) {
        return (
            <div className="p-6 text-sm text-gray-500">
                Article not found.{' '}
                <button onClick={handleBack} className="text-blue-600 hover:underline">
                    Go back
                </button>
            </div>
        );
    }

    const {data: frontmatter, body} = parseFrontmatter(article.content_md ?? '');
    const processedContent = rewriteCitations(rewriteWikilinks(body));

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-3 flex-shrink-0">
                <button
                    onClick={handleBack}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                    <ChevronLeft size={16}/>
                    Back
                </button>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                    <h1 className="text-base font-semibold text-gray-800 truncate">{article.title}</h1>
                    <ArticleBadge type={article.article_type as KbArticleType}/>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatDateTime(article.generated_at)}
                </span>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
                <ArticleMeta data={frontmatter}/>
                <div className={CHAT_UI_CONSTANTS.MARKDOWN_PROSE}>
                    <SciMarkdown components={{a: renderLink}}>{processedContent}</SciMarkdown>
                </div>
            </div>
        </div>
    );
}
