/**
 * Single message bubble — user (right-aligned) or assistant (left-aligned).
 *
 * Spec-driven: walks ``ChatMessage.content`` and renders each part in
 * order. Tool calls are paired with their ``tool_result`` (matched by
 * ``call_id``) and rendered as a single block.
 *
 * Sibling of ``frontend/src/components/Apps/Chat/MessageItem.tsx`` —
 * adapted for narrow task-pane width.
 */
import React, { memo, useMemo, useState } from 'react';
import { Copy, Check, FileText, Image as ImageIcon } from 'lucide-react';
import type {
  ChatMessage,
  CitationPart,
  ContentPart,
  DynamicPart,
  FilePart,
  ImagePart,
  ReasoningPart,
  SubagentPart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
} from '@scitrera/messaging-spec';

import { cn, timestampToString } from '../../lib/utils';
import { SciMarkdown } from './SciMarkdown';
import { ToolCallDisplay, type ToolBlockView } from './ToolCallDisplay';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a spec ChatMessage's ``created_at`` ISO string to Unix seconds. */
function specMessageTimestamp(msg: ChatMessage): number {
  if (msg.created_at) {
    const t = Date.parse(msg.created_at);
    if (!Number.isNaN(t)) return t / 1000;
  }
  return 0;
}

/** Concatenate every ``text`` part — used for the copy-to-clipboard button. */
function specMessageText(msg: ChatMessage): string {
  let out = '';
  for (const part of msg.content) {
    if (part.type === 'text') {
      const text = (part as TextPart).text;
      if (typeof text === 'string') out += text;
    }
  }
  return out;
}

/** Pair a ToolCallPart with its companion ToolResultPart for the renderer. */
function toToolBlockView(
  callPart: ToolCallPart,
  resultPart: ToolResultPart | undefined,
): ToolBlockView {
  const status: ToolBlockView['status'] = (() => {
    if (resultPart) return resultPart.is_error ? 'failed' : 'completed';
    const s = callPart.status;
    if (s === 'pending' || s === 'running') return 'running';
    if (s === 'cancelled') return 'cancelled';
    if (s === 'failed') return 'failed';
    return 'completed';
  })();
  const resultText = resultPart
    ? (resultPart.output_text ??
        (resultPart.output != null ? JSON.stringify(resultPart.output) : undefined))
    : undefined;
  return {
    id: callPart.id,
    name: callPart.name || '',
    input: callPart.args ?? {},
    output: resultText,
    status,
    errorMessage: resultPart?.error?.message,
  };
}

// ---------------------------------------------------------------------------
// Part renderers
// ---------------------------------------------------------------------------

function SpecFileChip({ part }: { part: FilePart }) {
  const label = part.file_name || part.vfs_ref || part.uri || 'attachment';
  return (
    <div className="my-1 inline-flex items-center gap-1.5 text-xs bg-gray-50 rounded px-2 py-1 border border-gray-100">
      <FileText size={11} className="text-gray-400" />
      <span className="text-gray-700 truncate max-w-[200px]">{label}</span>
    </div>
  );
}

function SpecImageChip({ part }: { part: ImagePart }) {
  // Task pane is narrow — render images as small chips rather than full
  // bitmaps (the main frontend has presigned-URL hydration; the add-in
  // does not yet).
  const label = part.alt_text || part.vfs_ref || part.uri || 'image';
  if (part.data_uri || part.uri) {
    const src = part.data_uri || part.uri || '';
    return (
      <img
        src={src}
        alt={part.alt_text || 'image'}
        className="block w-auto h-auto max-w-full max-h-[240px] object-contain rounded border border-gray-200 my-2"
      />
    );
  }
  return (
    <div className="my-1 inline-flex items-center gap-1.5 text-xs bg-gray-50 rounded px-2 py-1 border border-gray-100">
      <ImageIcon size={11} className="text-gray-400" />
      <span className="text-gray-700 truncate max-w-[200px]">{label}</span>
    </div>
  );
}

function SpecSubagentChip({ part }: { part: SubagentPart }) {
  const summary = part.summary || '';
  return (
    <div className="my-2 text-xs rounded border border-indigo-100 bg-indigo-50/50 px-2 py-1.5">
      <div className="font-medium text-indigo-700">
        {part.name || 'subagent'}{' '}
        <span className="font-mono text-[10px] text-indigo-500">→ {part.thread_id}</span>
      </div>
      {summary && <div className="mt-1 text-gray-700">{summary}</div>}
    </div>
  );
}

function SpecDynamicChip({ part }: { part: DynamicPart }) {
  return (
    <div className="my-1 inline-flex items-center gap-1.5 text-xs bg-purple-50 rounded px-2 py-1 border border-purple-100">
      <span className="text-purple-700">dynamic: {part.kind}</span>
    </div>
  );
}

function SpecUnknownChip({ part }: { part: ContentPart }) {
  return (
    <span
      className="inline-block px-1.5 py-0.5 mx-0.5 text-[11px] rounded bg-gray-100 border border-gray-200 text-gray-500 align-baseline"
      title={`Unsupported content part: ${String(part.type)}`}
    >
      unsupported: {String(part.type)}
    </span>
  );
}

interface RenderedContent {
  nodes: React.ReactNode[];
  citations: CitationPart[];
  reasoning: { text: string; redacted: boolean } | null;
}

function renderSpecContent(content: ContentPart[], isUser: boolean): RenderedContent {
  const nodes: React.ReactNode[] = [];
  const citations: CitationPart[] = [];
  let reasoning: RenderedContent['reasoning'] = null;

  // Index tool_result by call_id so we can pair with its tool_call.
  const resultByCallId = new Map<string, ToolResultPart>();
  for (const p of content) {
    if (p.type === 'tool_result') {
      const r = p as ToolResultPart;
      if (r.call_id) resultByCallId.set(r.call_id, r);
    }
  }

  content.forEach((part, idx) => {
    switch (part.type) {
      case 'text': {
        const text = (part as TextPart).text;
        if (!text) return;
        if (isUser) {
          nodes.push(
            <p
              key={`t${idx}`}
              className="whitespace-pre-wrap break-words"
            >
              {text}
            </p>,
          );
        } else {
          nodes.push(
            <SciMarkdown
              key={`t${idx}`}
              content={text}
              className="text-gray-900"
            />,
          );
        }
        return;
      }
      case 'tool_call': {
        const callPart = part as ToolCallPart;
        const view = toToolBlockView(callPart, resultByCallId.get(callPart.id));
        nodes.push(
          <ToolCallDisplay
            key={`tc${idx}_${callPart.id}`}
            toolBlocks={[view]}
          />,
        );
        return;
      }
      case 'tool_result':
        // Paired above.
        return;
      case 'citation':
        citations.push(part as CitationPart);
        return;
      case 'image':
        nodes.push(<SpecImageChip key={`im${idx}`} part={part as ImagePart} />);
        return;
      case 'file':
        nodes.push(<SpecFileChip key={`fl${idx}`} part={part as FilePart} />);
        return;
      case 'reasoning': {
        const r = part as ReasoningPart;
        reasoning = { text: r.text || '', redacted: Boolean(r.redacted) };
        return;
      }
      case 'subagent':
        nodes.push(<SpecSubagentChip key={`sa${idx}`} part={part as SubagentPart} />);
        return;
      case 'dynamic':
        nodes.push(<SpecDynamicChip key={`dy${idx}`} part={part as DynamicPart} />);
        return;
      default:
        // Forward-compat: unknown parts surface as gray chips rather than
        // being silently dropped (spec invariant).
        nodes.push(<SpecUnknownChip key={`u${idx}`} part={part} />);
    }
  });

  return { nodes, citations, reasoning };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MessageItemProps {
  msg: ChatMessage;
}

export const MessageItem = memo(function MessageItem({ msg }: MessageItemProps) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);

  const { nodes, citations, reasoning } = useMemo(
    () => renderSpecContent(msg.content, isUser),
    [msg.content, isUser],
  );

  const plainText = useMemo(() => specMessageText(msg), [msg]);
  const timestamp = specMessageTimestamp(msg);

  const handleCopy = () => {
    void navigator.clipboard.writeText(plainText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={cn('w-full flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'relative group rounded-lg px-3 py-2 max-w-[88%] text-sm min-w-0',
          isUser
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-900 rounded-bl-sm',
        )}
      >
        {/* Content parts in order */}
        {nodes}

        {/* Reasoning trace — collapsed by default. */}
        {reasoning && (reasoning.text || reasoning.redacted) && (
          <details className="mt-1.5 text-[11px] text-gray-500">
            <summary className="cursor-pointer select-none">Reasoning</summary>
            <pre className="mt-1 whitespace-pre-wrap break-words bg-white text-gray-600 p-1.5 rounded border border-gray-200">
              {reasoning.text || '(redacted)'}
            </pre>
          </details>
        )}

        {/* Citations footer */}
        {citations.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-gray-200 space-y-0.5">
            {citations.map((c, i) => (
              <div key={i} className="text-[10px] text-gray-500">
                <span className="font-medium">
                  {c.source || c.title || 'source'}
                </span>
                {c.snippet ? `: ${c.snippet}` : ''}
              </div>
            ))}
          </div>
        )}

        {/* Timestamp + copy button */}
        <div className="flex items-center justify-between mt-1 gap-2">
          <span
            className={cn(
              'text-[10px]',
              isUser ? 'text-blue-200' : 'text-gray-400',
            )}
          >
            {timestamp ? timestampToString(timestamp) : ''}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded',
              isUser
                ? 'text-blue-200 hover:text-white'
                : 'text-gray-400 hover:text-gray-600',
            )}
            title="Copy message"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
          </button>
        </div>
      </div>
    </div>
  );
});
