import {BookOpen, ChevronDown, ChevronRight, Network, Tag} from 'lucide-react';
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@/components/ui/collapsible';
import {ScrollArea} from '@/components/ui/scroll-area';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useKnowledgebaseState} from '@/hooks/useKnowledgebaseState';
import {useState} from 'react';
import type {KbArticle} from '@/types/knowledgebase';

function ArticleRow({article, isActive}: {article: KbArticle; isActive: boolean}) {
    const updateAppUrl = useAppPanelStore(s => s.updateAppUrl);

    const handleClick = () => {
        updateAppUrl({path: `articles/${article.id}`});
    };

    const Icon = article.article_type === 'index'
        ? BookOpen
        : article.article_type === 'community'
            ? Network
            : Tag;

    return (
        <button
            onClick={handleClick}
            className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
            }`}
        >
            <Icon size={14} className="flex-shrink-0 text-gray-400"/>
            <span className="truncate">{article.title}</span>
        </button>
    );
}

interface GroupProps {
    label: string;
    count: number;
    articles: KbArticle[];
    activeArticleId: string | null;
    defaultOpen?: boolean;
}

function ArticleGroup({label, count, articles, activeArticleId, defaultOpen = true}: GroupProps) {
    const [open, setOpen] = useState(defaultOpen);

    if (articles.length === 0) return null;

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700">
                <span className="flex items-center gap-1.5">
                    {label}
                    <span className="bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 text-xs font-normal normal-case tracking-normal">
                        {count}
                    </span>
                </span>
                {open ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="pb-2">
                    {articles.map(a => (
                        <ArticleRow key={a.id} article={a} isActive={a.id === activeArticleId}/>
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

export function ArticleSidebar() {
    const {articles, activeArticleId} = useKnowledgebaseState();

    const indexArticles = articles.filter(a => a.article_type === 'index');
    const communityArticles = articles.filter(a => a.article_type === 'community');
    const entityArticles = articles.filter(a => a.article_type === 'entity');

    return (
        <div className="w-[280px] flex-shrink-0 border-r bg-gray-50 flex flex-col min-h-0 h-full">
            <div className="px-3 py-2 border-b">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Articles</span>
            </div>
            <ScrollArea className="flex-1 min-h-0">
                <div className="py-2">
                    <ArticleGroup
                        label="Overview"
                        count={indexArticles.length}
                        articles={indexArticles}
                        activeArticleId={activeArticleId}
                        defaultOpen={true}
                    />
                    <ArticleGroup
                        label="Communities"
                        count={communityArticles.length}
                        articles={communityArticles}
                        activeArticleId={activeArticleId}
                        defaultOpen={true}
                    />
                    <ArticleGroup
                        label="Entities"
                        count={entityArticles.length}
                        articles={entityArticles}
                        activeArticleId={activeArticleId}
                        defaultOpen={false}
                    />
                </div>
            </ScrollArea>
        </div>
    );
}
