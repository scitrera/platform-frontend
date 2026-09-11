/**
 * TypeScript interfaces mirroring the MemoryLayer Pydantic models.
 * Source of truth:
 *   memorylayer_server/services/knowledgebase/base.py  (Article, Knowledgebase)
 *   memorylayer_server/models/graph_analysis.py        (Community, CentralNode, Bridge, GraphStats, GraphAnalysis)
 */

export type KbArticleType = 'index' | 'community' | 'entity';

export interface KbArticle {
    id: string;
    article_type: KbArticleType;
    title: string;
    /** Full markdown content. Only present after kb_get_article; list responses omit this. */
    content_md?: string;
    metadata: Record<string, unknown>;
    generated_at: string; // ISO 8601 datetime string
}

/**
 * A single memory, as returned by the `memory.get` service-proxy op. Mirrors the
 * MemoryLayer `Memory` model (subset used by the viewer). `type` is the cognitive
 * memory type; `subtype` the domain classification.
 */
export interface KbMemory {
    id: string;
    content: string;
    abstract?: string | null;
    overview?: string | null;
    type?: string | null;
    subtype?: string | null;
    importance?: number;
    tags?: string[];
    created_at?: string;
    event_time?: string | null;
    source_document_id?: string | null;
    source_page_id?: string | null;
    trust_score?: number | null;
    freshness_score?: number | null;
    workspace_id?: string;
    metadata?: Record<string, unknown>;
}

export interface KbMetadata {
    workspace_id: string;
    article_count: number;
    community_count: number;
    generated_at: string; // ISO 8601 datetime string
    stats: KbGraphStats | null;
}

export interface KbGraphStats {
    node_count: number;
    edge_count: number;
    community_count: number;
    density: number;
    avg_degree: number;
    max_degree: number;
    god_node_count: number;
}

export interface KbCommunity {
    id: number;
    memory_ids: string[];
    size: number;
    cohesion_score: number;
    central_node_ids: string[];
    label: string | null;
}

export interface KbCentralNode {
    memory_id: string;
    /** Short human-readable snippet (memory abstract/content) for display. */
    label?: string | null;
    degree: number;
    betweenness: number;
    community_id: number;
}

export interface KbBridge {
    source_community_id: number;
    target_community_id: number;
    memory_id_source: string;
    memory_id_target: string;
    relationship_type: string;
    strength: number;
}

export interface KbGraphSnapshot {
    workspace_id: string;
    context_id: string | null;
    node_count: number;
    edge_count: number;
    includes_rpg: boolean;
}

export interface KbGraphAnalysis {
    snapshot: KbGraphSnapshot;
    communities: KbCommunity[];
    central_nodes: KbCentralNode[];
    bridges: KbBridge[];
    stats: KbGraphStats;
}
