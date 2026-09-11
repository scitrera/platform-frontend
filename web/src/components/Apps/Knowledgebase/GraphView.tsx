import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import ForceGraph2D, {type GraphData, type LinkObject, type NodeObject} from 'react-force-graph-2d';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useKnowledgebaseState} from '@/hooks/useKnowledgebaseState';
import type {KbGraphAnalysis} from '@/types/knowledgebase';

const COLOR_COMMUNITY = '#7aa2f7';
const COLOR_ENTITY = '#9ece6a';
const COLOR_BRIDGE = '#e0af68';

/**
 * Extra fields the chart attaches to each node beyond the package's
 * NodeObject base (which contributes id/x/y/simulation slots).
 */
interface GraphNodeData {
    id: string;
    label: string;
    nodeType: 'community' | 'entity';
    color: string;
    communityId?: number;
    entityMemoryId?: string;
}

interface GraphLinkData {
    source: string;
    target: string;
    color: string;
}

type GraphNode = NodeObject<GraphNodeData>;
type GraphLink = LinkObject<GraphNodeData, GraphLinkData>;

function buildGraphData(
    analysis: KbGraphAnalysis,
    communityTitleById: Map<number, string>,
): GraphData<GraphNodeData, GraphLinkData> {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const nodeIds = new Set<string>();

    for (const c of analysis.communities) {
        const nodeId = `community-${c.id}`;
        nodes.push({
            id: nodeId,
            // Prefer the generated community-article title; fall back to any label
            // on the graph payload, then a generic name.
            label: communityTitleById.get(c.id) ?? c.label ?? `Community ${c.id}`,
            nodeType: 'community',
            color: COLOR_COMMUNITY,
            communityId: c.id,
        });
        nodeIds.add(nodeId);
    }

    for (const cn of analysis.central_nodes) {
        const nodeId = `entity-${cn.memory_id}`;
        if (!nodeIds.has(nodeId)) {
            nodes.push({
                id: nodeId,
                // Backend sends a short memory snippet; fall back to the id.
                label: cn.label ?? cn.memory_id,
                nodeType: 'entity',
                color: COLOR_ENTITY,
                entityMemoryId: cn.memory_id,
                communityId: cn.community_id,
            });
            nodeIds.add(nodeId);
        }
        // Edge: entity → community
        const communityNodeId = `community-${cn.community_id}`;
        if (nodeIds.has(communityNodeId)) {
            links.push({
                source: nodeId,
                target: communityNodeId,
                color: COLOR_ENTITY + '88',
            });
        }
    }

    // Bridges: community ↔ community
    for (const b of analysis.bridges) {
        const src = `community-${b.source_community_id}`;
        const tgt = `community-${b.target_community_id}`;
        if (nodeIds.has(src) && nodeIds.has(tgt)) {
            links.push({source: src, target: tgt, color: COLOR_BRIDGE});
        }
    }

    return {nodes, links};
}

function StatRow({label, value}: {label: string; value: string | number}) {
    return (
        <div className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0">
            <span className="text-gray-500">{label}</span>
            <span className="font-mono text-gray-800">{value}</span>
        </div>
    );
}

export function GraphView() {
    const updateAppUrl = useAppPanelStore(s => s.updateAppUrl);
    const {articles, graph, loading, loadGraph} = useKnowledgebaseState();
    // Communities-only by default (lighter); "Show All Memories" fetches the full
    // per-memory graph.
    const [showAll, setShowAll] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({width: 600, height: 400});

    // Load on mount and reload whenever the memory toggle changes.
    useEffect(() => {
        void loadGraph(showAll);
    }, [showAll, loadGraph]);

    // Map community id → generated article title, so graph community nodes show
    // their real topic name instead of "Community N".
    const communityTitleById = useMemo(() => {
        const map = new Map<number, string>();
        for (const a of articles) {
            if (a.article_type !== 'community') continue;
            const m = /^community-(\d+)$/.exec(a.id);
            if (m) map.set(Number(m[1]), a.title);
        }
        return map;
    }, [articles]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const {width, height} = entry.contentRect;
                setDimensions({width: Math.floor(width), height: Math.floor(height)});
            }
        });
        ro.observe(el);
        // Initial measurement
        setDimensions({
            width: Math.floor(el.clientWidth),
            height: Math.floor(el.clientHeight),
        });
        return () => ro.disconnect();
    }, []);

    const graphData = useMemo(
        () => (graph ? buildGraphData(graph, communityTitleById) : {nodes: [], links: []}),
        [graph, communityTitleById],
    );
    const stats = graph?.stats;

    const handleNodeClick = useCallback((node: GraphNode) => {
        if (node.nodeType === 'community' && node.communityId !== undefined) {
            updateAppUrl({path: `articles/community-${node.communityId}`});
        } else if (node.nodeType === 'entity' && node.entityMemoryId) {
            // Central nodes are memories → open the memory viewer.
            updateAppUrl({path: `memory/${node.entityMemoryId}`});
        }
    }, [updateAppUrl]);

    return (
        <div className="flex h-full w-full min-h-0 min-w-0">
            <div ref={containerRef} className="relative flex-1 min-h-0 min-w-0 bg-gray-950">
                {loading && !graph && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-gray-400">
                        Loading graph…
                    </div>
                )}
                {dimensions.width > 0 && dimensions.height > 0 && (
                    <ForceGraph2D<GraphNodeData, GraphLinkData>
                        graphData={graphData}
                        width={dimensions.width}
                        height={dimensions.height}
                        nodeLabel="label"
                        nodeColor={(node) => node.color}
                        linkColor={(link) => link.color}
                        onNodeClick={handleNodeClick}
                        nodeRelSize={6}
                        linkWidth={1.5}
                        backgroundColor="#0f1117"
                        nodeCanvasObjectMode={() => 'after'}
                        nodeCanvasObject={(node, ctx, globalScale) => {
                            if (node.x == null || node.y == null) return;
                            const fontSize = Math.max(8, 12 / globalScale);
                            ctx.font = `${fontSize}px sans-serif`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = '#c0caf5';
                            // Truncate the always-on label; the full text shows on hover
                            // (nodeLabel="label").
                            const text = node.label.length > 32 ? `${node.label.slice(0, 31)}…` : node.label;
                            ctx.fillText(text, node.x, node.y + 10 / globalScale);
                        }}
                    />
                )}
            </div>
            <div className="w-48 flex-shrink-0 border-l bg-gray-50 p-4 overflow-y-auto">
                <label className="flex items-center gap-2 text-xs text-gray-600 mb-4 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={showAll}
                        onChange={e => setShowAll(e.target.checked)}
                        className="rounded border-gray-300"
                    />
                    Show All Memories
                </label>
                {stats && (
                    <>
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Graph Stats</div>
                        <StatRow label="Nodes" value={stats.node_count}/>
                        <StatRow label="Edges" value={stats.edge_count}/>
                        <StatRow label="Communities" value={stats.community_count}/>
                        <StatRow label="Density" value={stats.density.toFixed(4)}/>
                        <StatRow label="Avg degree" value={stats.avg_degree.toFixed(1)}/>
                        <StatRow label="Max degree" value={stats.max_degree}/>
                    </>
                )}
                <div className="mt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Legend</div>
                    <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{background: COLOR_COMMUNITY}}/>
                        Community
                    </div>
                    {showAll && (
                        <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{background: COLOR_ENTITY}}/>
                            Memory
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{background: COLOR_BRIDGE}}/>
                        Bridge
                    </div>
                </div>
            </div>
        </div>
    );
}
