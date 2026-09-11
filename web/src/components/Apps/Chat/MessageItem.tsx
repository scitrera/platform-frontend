import React, {memo, useState, useEffect, useCallback, useMemo} from 'react';
import {Copy, Check, ThumbsUp, ThumbsDown, FileText, Ban, Eye, Download} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {CHAT_UI_CONSTANTS} from '../../../constants/AppConstants';
import {cn, timestampToString} from '../../../lib/utils';
import {ActivityGroup, type Activity} from './ActivityGroup';
import {CitationList} from './CitationList';
import {DynamicContentList} from './DynamicContentList';
import {ProgressBar, type ProgressPayload} from './ProgressBar';
import {ApprovalCard} from './ApprovalCard';
import {SciMarkdown} from './SciMarkdown';
import type {
    ChatMessage as SpecChatMessage,
    ContentPart,
    ToolCallPart,
    ToolResultPart,
    TextPart,
    CitationPart,
    DynamicPart,
    ImagePart,
    FilePart,
    ReasoningPart,
    SubagentPart,
    ApprovalRequestPart,
} from '@scitrera/messaging-spec';
import type {ToolCall, Citation, DynamicContentBlock} from '@/types/chat';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useChatState} from '@/hooks/useChatState';
import {useWebSocket} from '@/hooks/useWebSocket.jsx';
import {useDocumentPresignedUrl, buildDownloadUrlFetcher} from '@/hooks/useDocumentPresignedUrl.jsx';
import {specMessageText, specMessageTimestamp} from '@/utils/messaging/specAdapters';
import {friendlyRefName} from '@/utils/artifactExtractor';
import {isViewable, openDocViewer} from '@/utils/docViewer';
import {rememberVfsMeta} from '@/utils/vfsMetaCache';

const {
    MAX_WIDTH_CLASS,
    USER_CONTAINER,
    USER_MSG_BG,
    AI_CONTAINER,
    AI_MSG_BG,
    MARKDOWN_PROSE,
    MARKDOWN_PROSE_AI,
} = CHAT_UI_CONSTANTS;

type FeedbackValue = 'up' | 'down' | null;

interface ActionButtonProps {
    onClick: () => void;
    icon: LucideIcon;
    title: string;
    active?: boolean;
    size?: number;
}

function ActionButton({onClick, icon: Icon, title, active = false, size = 14}: ActionButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'p-1 rounded transition-colors',
                active
                    ? 'text-blue-500 bg-blue-50'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            )}
            title={title}
        >
            <Icon size={size}/>
        </button>
    );
}

export interface MessageItemProps {
    msg: SpecChatMessage;
    /** The user cancelled this (assistant) turn after the model had responded. */
    cancelled?: boolean;
    onFeedback?: (id: string, fb: FeedbackValue) => void;
    registerRef?: (id: string, el: HTMLElement | null) => void;
}

// ─── Part-by-part renderers ───────────────────────────────────────────

function SpecImage({part}: {part: ImagePart}) {
    // Common image styling matches the legacy DynamicContentList renderer.
    const className = 'block w-auto h-auto max-w-full max-h-[480px] object-contain rounded border border-gray-200 shadow-sm my-2';
    const workspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const vfsRef = part.vfs_ref ?? '';
    const {url, isLoading, error} = useDocumentPresignedUrl(vfsRef, workspaceId ?? '');
    if (part.data_uri) {
        return <img src={part.data_uri} alt={part.alt_text || 'image'} className={className}/>;
    }
    if (part.uri) {
        return <img src={part.uri} alt={part.alt_text || 'image'} className={className}/>;
    }
    if (vfsRef !== '') {
        if (isLoading) {
            return <div className="my-2 h-32 w-full bg-gray-100 rounded animate-pulse"/>;
        }
        if (error || !url) {
            return (
                <div className="text-xs text-red-500 my-2">
                    Failed to load image{part.alt_text ? ` (${part.alt_text})` : ''}: {error || 'no URL'}.
                </div>
            );
        }
        return <img src={url} alt={part.alt_text || 'image'} className={className}/>;
    }
    return null;
}

function SpecFile({part}: {part: FilePart}) {
    // Prefer the friendly filename; fall back to a basename derived from the
    // vfs_ref (never the raw ref) so inline refs read like "report.pdf".
    const label = part.file_name || friendlyRefName(part.vfs_ref) || 'attachment';
    const workspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const vfsRef = part.vfs_ref ?? '';
    const directUri = part.uri ?? '';
    const {sendRpcRequest} = useWebSocket();
    const [minting, setMinting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Remember this file's name/type keyed by vfs_ref so the document viewer
    // (opened with only the vfs_ref) can render a real title + pick the right
    // sub-view without a lookup — a vfs_ref can't be resolved via the doc_id
    // metadata RPC (separate systems).
    useEffect(() => {
        if (vfsRef) rememberVfsMeta(vfsRef, {file_name: part.file_name, mime: part.mime});
    }, [vfsRef, part.file_name, part.mime]);

    // Generated files presented via present_artifact ride as a vfs_ref, so the
    // chip is a download link. Mint the presigned URL LAZILY, on click, rather
    // than eagerly at render: the minted URL is short-lived (~minutes), so a
    // chip that's been on screen past that window would otherwise hand the
    // browser an already-expired URL. Minting at click time keeps it fresh.
    const handleDownload = useCallback(async () => {
        if (!vfsRef || !workspaceId || minting) return;
        // Open the target tab synchronously inside the click gesture so the async
        // mint below isn't popup-blocked, then navigate it once the URL lands.
        const win = window.open('', '_blank');
        if (win) win.opener = null;
        setMinting(true);
        setError(null);
        try {
            const mint = buildDownloadUrlFetcher(workspaceId, sendRpcRequest);
            const {url} = await mint(vfsRef, 1);
            if (!url) throw new Error('no url');
            if (win) win.location.href = url;
            else window.location.href = url; // popup blocked → same tab (download disposition keeps the page)
        } catch (e) {
            win?.close();
            console.error('Error fetching file download URL:', e);
            setError('Failed to load file');
        } finally {
            setMinting(false);
        }
    }, [vfsRef, workspaceId, minting, sendRpcRequest]);

    // Offer an in-app preview ("View") for text-based types (md/csv/code/…),
    // opening the doc-viewer beside chat. Download stays available for every
    // vfs/uri-backed file.
    const canView = vfsRef !== '' && isViewable(part.file_name, part.mime);
    const handleView = useCallback(() => {
        if (!vfsRef) return;
        // Pass only the vfs_ref — the viewer resolves name/type itself (and this
        // merges into the query bag, preserving chat's thread param).
        openDocViewer({vfsRef});
    }, [vfsRef]);

    return (
        <div className="my-1 inline-flex items-center gap-2 text-xs bg-gray-50 rounded px-2 py-1 border border-gray-100">
            <FileText size={12} className="text-gray-400 shrink-0"/>
            <span className="text-gray-700 truncate max-w-[16rem]" title={label}>{label}</span>
            {canView && (
                <button type="button" onClick={handleView}
                        className="inline-flex items-center gap-0.5 text-blue-600 hover:underline shrink-0"
                        title={`View ${label}`}>
                    <Eye size={12}/> View
                </button>
            )}
            {directUri ? (
                // A direct uri is stable — no minting needed.
                <a href={directUri} download={part.file_name || undefined} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-0.5 text-blue-600 hover:underline shrink-0"
                   title={`Download ${label}`}>
                    <Download size={12}/> Download
                </a>
            ) : vfsRef !== '' ? (
                <button type="button" onClick={handleDownload} disabled={minting}
                        className="inline-flex items-center gap-0.5 text-blue-600 hover:underline shrink-0 disabled:text-gray-400 disabled:no-underline disabled:cursor-default"
                        title={error || `Download ${label}`}>
                    <Download size={12}/> {minting ? '…' : 'Download'}
                </button>
            ) : null}
        </div>
    );
}

function SpecSubagent({part}: {part: SubagentPart}) {
    const {selectThread, upsertThread, activeThreadId} = useChatState();
    const summary = part.summary || '';
    const childId = part.thread_id;

    // Open the subagent's own thread. The parent is the thread this part was
    // rendered in — the one active at click time. The top-level thread list
    // doesn't include sub-threads, so register the child (name from the part)
    // into thread state before selecting it; ChatBody's history effect then
    // fires CHAT.HISTORY for the newly-active thread. A child id is never the
    // default thread, so it serializes to the URL verbatim.
    const openChildThread = useCallback(() => {
        if (!childId) return;
        upsertThread({
            id: childId,
            name: part.name || 'Subagent',
            lastActivity: null,
            parentThreadId: activeThreadId,
        });
        selectThread(childId);
        const qp = useAppPanelStore.getState().appQueryParams as Record<string, string> | null;
        useAppPanelStore.getState().updateAppUrl({query: {...(qp || {}), thread: childId}});
    }, [childId, part.name, activeThreadId, selectThread, upsertThread]);

    return (
        <div className="my-2 text-xs rounded border border-indigo-100 bg-indigo-50/50 px-2 py-1.5">
            <button
                type="button"
                onClick={openChildThread}
                disabled={!childId}
                title={childId ? `Open subagent thread: ${childId}` : undefined}
                className="font-medium text-indigo-700 text-left hover:text-indigo-900 hover:underline disabled:cursor-default disabled:no-underline disabled:text-indigo-700"
            >
                {part.name || 'subagent'} → <span className="font-mono text-[10px]">{childId}</span>
            </button>
            {summary && <div className="mt-1 text-gray-700">{summary}</div>}
        </div>
    );
}

function SpecUnknown({part}: {part: ContentPart}) {
    return (
        <span
            className="inline-block px-1.5 py-0.5 mx-0.5 text-[11px] rounded bg-gray-100 border border-gray-200 text-gray-500 align-baseline"
            title={`Unsupported content part: ${String(part.type)}`}
        >
            unsupported: {String(part.type)}
        </span>
    );
}

// Maps a spec ToolCallPart + companion ToolResultPart onto the ToolCall shape
// consumed by ``ActivityGroup`` / ``ToolLine``.
function toLegacyToolCall(
    callPart: ToolCallPart,
    resultPart: ToolResultPart | undefined,
): ToolCall {
    const status = (() => {
        if (resultPart) {
            return resultPart.is_error ? 'failed' : 'completed';
        }
        const s = callPart.status;
        if (s === 'pending' || s === 'running') return 'running';
        if (s === 'cancelled') return 'cancelled';
        if (s === 'failed') return 'failed';
        return 'completed';
    })();
    const resultText = resultPart
        ? (resultPart.output_text
            ?? (resultPart.output != null ? JSON.stringify(resultPart.output) : ''))
        : undefined;
    return {
        id: callPart.id,
        name: callPart.name || '',
        args: callPart.args || {},
        result: resultText,
        status,
    };
}

interface RenderedContent {
    inline: React.ReactNode[];
    citations: Citation[];
    dynamicBlocks: DynamicContentBlock[];
}

/**
 * Walk a spec ChatMessage's ``content`` array and produce:
 *   - the inline render order (text + activities + images + files + subagents
 *     + unknown parts at their original position),
 *   - the citation footer batch,
 *   - the dynamic-content footer batch (unmapped ``dynamic`` parts).
 *
 * Consecutive ACTIVITIES — tool calls (each paired with its ``tool_result`` so
 * the user sees the call → result as one entity), model-reasoning traces, and
 * resolved approval decisions — accumulate into one run rendered via
 * ``ActivityGroup``. They're distinct part types but read to the user as the
 * same kind of thing (the agent working), so the backlog collapses into a
 * single "N activities" banner and only the latest / in-progress one stays
 * surfaced. A *pending* approval is action-required, so it breaks the run and
 * renders on its own.
 */
function renderSpecContent(content: ContentPart[]): RenderedContent {
    const inline: React.ReactNode[] = [];
    const citations: Citation[] = [];
    const dynamicBlocks: DynamicContentBlock[] = [];

    // Index tool_result by call_id so we can pair it with its tool_call.
    const resultByCallId = new Map<string, ToolResultPart>();
    content.forEach((p) => {
        if (p.type === 'tool_result') {
            const r = p as ToolResultPart;
            if (r.call_id) resultByCallId.set(r.call_id, r);
        }
    });

    // Consecutive activities accumulate into a group so the UI can collapse a
    // back-to-back run into one banner (see ActivityGroup). Out-of-band /
    // footer-batched parts (tool_result, todo, citation, dynamic) do NOT break
    // a run — only parts that emit their own inline content do.
    let group: Activity[] = [];
    let groupSeq = 0;
    const flushGroup = (trailing: boolean) => {
        if (group.length === 0) return;
        const activities = group;
        group = [];
        inline.push(<ActivityGroup key={`ag${groupSeq++}`} activities={activities} trailing={trailing}/>);
    };

    content.forEach((part, idx) => {
        const t = part.type;
        if (t === 'tool_call') {
            const callPart = part as ToolCallPart;
            // The canonical, user-facing view of the agent's plan is the
            // ``todo`` part (rendered by TodoPanel), so suppress the raw
            // ``todo_write`` tool_call/tool_result rows to avoid duplicating
            // the board as tool noise (handoff §7). It's skipped without
            // breaking the surrounding tool-call run.
            if (callPart.name === 'todo_write') return;
            const resultPart = resultByCallId.get(callPart.id);
            group.push({
                kind: 'tool',
                key: `tc${idx}_${callPart.id}`,
                call: toLegacyToolCall(callPart, resultPart),
            });
            return;
        }
        if (t === 'tool_result') {
            // Already paired with its tool_call (or suppressed for todo_write);
            // doesn't break the run.
            return;
        }
        if (t === 'todo') {
            // Rendered out-of-band by the slide-up TodoPanel (the live board
            // is the latest todo part across the whole thread), not inline in
            // the message bubble. Doesn't break the run.
            return;
        }
        if (t === 'reasoning') {
            // Kept INLINE at its position rather than batched into one footer
            // pane: a tool-loop turn produces one reasoning part per model call
            // (the harness appends each iteration's non-tool_call parts —
            // tool_loop.go), so a last-wins single pane destroyed the record of
            // WHERE the agent thought and made the lone surviving block appear
            // to mutate as the turn progressed. Each trace stays its own pane,
            // joining the surrounding activity run so a turn reads
            // reasoning → tools → reasoning → tools → answer, collapsed to one
            // banner once the turn moves on.
            const r = part as ReasoningPart;
            const text = r.text || (r.redacted ? '(redacted)' : '');
            // Nothing to show (empty, non-redacted trace) — skip WITHOUT
            // breaking an open run.
            if (!text) return;
            group.push({kind: 'reasoning', key: `rs${idx}`, text});
            return;
        }
        if (t === 'approval_request') {
            // Human-in-the-loop permission prompt — a distinct interactive card
            // (self-contained: routes the user's approve/deny decision to the
            // in-flight task). Keyed by the request id so concurrent prompts
            // render and resolve independently.
            const appr = part as ApprovalRequestPart;
            // A RESOLVED decision is just another after-the-fact activity row,
            // so it joins the run and collapses with it. A PENDING one is
            // action-required: it must never hide behind a banner, so it breaks
            // the run (collapsing the backlog behind it) and renders on its own.
            if (appr.status !== 'pending') {
                group.push({kind: 'approval', key: `ap${idx}_${appr.id}`, part: appr});
                return;
            }
            flushGroup(false);
            inline.push(<ApprovalCard key={`ap${idx}_${appr.id}`} part={appr}/>);
            return;
        }
        if (t === 'citation') {
            const c = part as CitationPart;
            const meta = (c.meta || {}) as {url?: string};
            citations.push({
                title: c.title ?? undefined,
                url: meta.url || c.source || undefined,
                source: c.source ?? undefined,
                snippet: c.snippet ?? undefined,
            });
            return;
        }
        if (t === 'dynamic') {
            const d = part as DynamicPart;
            // A live tqdm-style progress bar renders inline as its own component
            // (not a legacy flat dynamic block), AT ITS POSITION in the content —
            // the bar is appended right after the tool_call it belongs to, so
            // flushing the open run first lands it directly under that call
            // (matching the live-streaming placement) instead of batched at the
            // end after any trailing explanatory text. The flush is ``trailing``
            // so the call the bar belongs to stays surfaced right above it.
            // Each bar is one stable content part that updates in place; keying
            // on its id lets React reconcile the frames.
            if (d.kind === 'tool_call_progress') {
                flushGroup(true);
                const key = (d as {id?: string}).id || `pb${idx}`;
                inline.push(
                    <ProgressBar key={key} payload={(d.payload || {}) as ProgressPayload}/>,
                );
                return;
            }
            // The legacy DynamicContentList only understands FLAT blocks
            // (kind, mime, doc_id, filename, data_base64). Pass the spec
            // ``payload`` through if it already looks flat; otherwise
            // synthesize a minimal block from kind.
            const payload = (d.payload as DynamicContentBlock | null | undefined) || {};
            dynamicBlocks.push({kind: d.kind, ...payload});
            return;
        }

        if (t === 'text') {
            const text = (part as TextPart).text;
            // An EMPTY text part renders nothing (streaming leaves these behind
            // as placeholders), so it must not break an open run — otherwise the
            // backlog splits into two banners with nothing between them.
            if (!text) return;
            flushGroup(false);
            inline.push(
                <SciMarkdown key={`t${idx}`}>{text}</SciMarkdown>,
            );
            return;
        }

        // Everything below emits inline content, so it ends any open activity
        // run (the run is "complete" — the turn has moved on to other content).
        flushGroup(false);

        if (t === 'image') {
            inline.push(<SpecImage key={`im${idx}`} part={part as ImagePart}/>);
            return;
        }
        if (t === 'file') {
            inline.push(<SpecFile key={`fl${idx}`} part={part as FilePart}/>);
            return;
        }
        if (t === 'subagent') {
            inline.push(<SpecSubagent key={`sa${idx}`} part={part as SubagentPart}/>);
            return;
        }
        // Forward-compat invariant — unknown parts must surface, not
        // silently drop. Renders inline as a small gray chip.
        inline.push(<SpecUnknown key={`u${idx}`} part={part}/>);
    });

    // A run that reaches the end of the message is the trailing/in-flight group:
    // surface the last activity live and collapse the earlier ones behind a banner.
    flushGroup(true);

    return {inline, citations, dynamicBlocks};
}

// ─── Component ────────────────────────────────────────────────────────

export const MessageItem = memo(({msg, cancelled = false, onFeedback, registerRef}: MessageItemProps) => {
    const isUser = msg.role === 'user';
    // Outer-element ref registration so the parent can scroll-to-message
    // (used by the artifacts sidebar). Effect-based cleanup ensures the map
    // entry is removed when the message unmounts (e.g. thread switch).
    const setOuterRef = useCallback((el: HTMLDivElement | null) => {
        if (registerRef) registerRef(msg.id, el);
    }, [registerRef, msg.id]);
    useEffect(() => {
        return () => {
            if (registerRef) registerRef(msg.id, null);
        };
    }, [registerRef, msg.id]);
    const containerBg = isUser ? USER_MSG_BG : AI_MSG_BG;
    const containerStyle = isUser ? USER_CONTAINER : AI_CONTAINER;
    const proseStyle = MARKDOWN_PROSE + (isUser ? '' : ` ${MARKDOWN_PROSE_AI}`);
    const maxWidth = isUser ? 'max-w-[75%]' : MAX_WIDTH_CLASS;
    // specMessageTimestamp already returns epoch MILLISECONDS (Date.parse of
    // created_at); timestampToString takes ms. Do NOT multiply by 1000 — that
    // double-scale rendered nonsense dates (e.g. "3/22/86").
    const formattedTime = timestampToString(specMessageTimestamp(msg));
    const edited = Boolean((msg.meta as {edited?: boolean} | undefined)?.edited);
    // The turn was cancelled either just now (ephemeral prop from the cancel
    // click) or in a prior session — the harness stamps ``meta.cancelled`` on
    // the finalized message so it persists in history and reloads.
    const showCancelled = cancelled || Boolean((msg.meta as {cancelled?: boolean} | undefined)?.cancelled);
    // Assistant display name: honor a per-agent custom name from message metadata
    // (meta.scitrera.agent_name, set by the harness) so user-customized agent names
    // surface in the footer label; falls back to "Scitrera".
    const agentName = (() => {
        const name = (msg.meta as {scitrera?: {agent_name?: unknown}} | undefined)?.scitrera?.agent_name;
        // Rendered as a JSX text child below, so React auto-escapes it (no XSS risk);
        // cap the length purely to keep the footer label from being stretched.
        return typeof name === 'string' && name.trim() ? name.trim().slice(0, 64) : 'Scitrera';
    })();

    // Plain-text view used by the copy action.
    const text = useMemo(() => specMessageText(msg), [msg]);

    const [copied, setCopied] = useState(false);
    const [feedback, setFeedback] = useState<FeedbackValue>(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    const handleFeedback = (type: 'up' | 'down') => {
        const newFeedback: FeedbackValue = feedback === type ? null : type; // toggle
        setFeedback(newFeedback);
        if (onFeedback) {
            onFeedback(msg.id, newFeedback);
        }
    };

    const {inline, citations, dynamicBlocks} = useMemo(
        () => renderSpecContent(msg.content),
        [msg.content],
    );

    // `min-w-0` keeps this flex item from stretching past its parent's
    // width when a child (e.g. an expanded tool-call <pre> with long
    // lines) reports a large intrinsic width. Without it the bubble
    // grows past max-w and breaks the chat layout; with it, the inner
    // <pre overflow-x-auto> scrolls horizontally inside a bounded bubble.
    return (
        <div ref={setOuterRef} className={cn('w-full flex', isUser ? 'justify-end' : 'justify-start')}>
            <div className={cn(containerBg, containerStyle, proseStyle, maxWidth, 'min-w-0', 'relative', 'group')}>
                {/* Message content (tqdm-style progress bars render inline at
                    their position in this flow — see renderSpecContent). */}
                <>{inline}</>

                {/* Turn-cancelled indicator: shown when the user halted this turn
                    after the model had already responded (single-line, styled
                    like the resolved tool/approval rows). */}
                {showCancelled && (
                    <div className="my-1 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
                        <Ban size={14} className="shrink-0 text-amber-600" aria-hidden/>
                        <span>Turn cancelled</span>
                    </div>
                )}

                {/* Reasoning traces, tool calls and resolved approvals render
                    INLINE above (see renderSpecContent) as one collapsible
                    "activity" run, each at its real position. */}

                {/* Citations footer */}
                {citations.length > 0 && <CitationList citations={citations}/>}

                {/* Dynamic content blocks (unmapped DynamicPart payloads). Native
                    image / file parts already render inline above. */}
                {dynamicBlocks.length > 0 && (
                    <DynamicContentList blocks={dynamicBlocks}/>
                )}

                {/* Footer: timestamp + action buttons */}
                <div className="flex items-center justify-between mt-2">
                        <p className={cn('text-xs', isUser ? 'text-gray-500 text-right' : 'text-gray-400')}>
                            {formattedTime}{!isUser && ` ${agentName}`}
                            {edited && <span className="ml-1 italic">(edited)</span>}
                        </p>

                        {/* Action buttons - appear on hover */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                            <ActionButton onClick={handleCopy} icon={copied ? Check : Copy}
                                          title="Copy message"/>

                            {/* Feedback - AI messages only */}
                            {!isUser && (
                                <>
                                    <ActionButton
                                        onClick={() => handleFeedback('up')}
                                        icon={ThumbsUp}
                                        title="Helpful"
                                        active={feedback === 'up'}
                                    />
                                    <ActionButton
                                        onClick={() => handleFeedback('down')}
                                        icon={ThumbsDown}
                                        title="Not helpful"
                                        active={feedback === 'down'}
                                    />
                                </>
                            )}
                        </div>
                    </div>
            </div>
        </div>
    );
});

MessageItem.displayName = 'MessageItem';
