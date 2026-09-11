/**
 * Collapsible display for agent tool calls within a chat message.
 * Spec-driven: consumes a ``ToolBlockView`` (a pre-paired ToolCallPart +
 * ToolResultPart) rather than peeking at output shape.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Wrench, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ToolStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Pre-paired view of a spec ToolCallPart with its companion ToolResultPart.
 * Built by ``MessageItem.toToolBlockView``.
 */
export interface ToolBlockView {
  id: string;
  name: string;
  input: unknown;
  /** Stringified result (output_text or JSON.stringify(output)). */
  output?: string;
  status: ToolStatus;
  errorMessage?: string;
}

interface ToolCallDisplayProps {
  toolBlocks: ToolBlockView[];
}

function StatusBadge({ status }: { status: ToolStatus }) {
  if (status === 'running') {
    return (
      <span className="flex items-center gap-1 text-blue-500 text-[10px]">
        <Loader2 size={10} className="animate-spin" />
        running
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-red-500 text-[10px]">
        <X size={10} />
        failed
      </span>
    );
  }
  if (status === 'cancelled') {
    return <span className="text-amber-600 text-[10px]">cancelled</span>;
  }
  return <span className="text-emerald-600 text-[10px]">ok</span>;
}

function ToolBlockItem({ block }: { block: ToolBlockView }) {
  const [expanded, setExpanded] = useState(false);

  const borderClass =
    block.status === 'failed'
      ? 'border-red-100'
      : block.status === 'running'
        ? 'border-blue-100'
        : block.status === 'cancelled'
          ? 'border-amber-100'
          : 'border-gray-100';

  return (
    <div className={cn('text-xs bg-gray-50 rounded p-1.5 border', borderClass)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono font-medium text-gray-700 truncate">{block.name}</span>
          <StatusBadge status={block.status} />
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-1"
        >
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-1 space-y-1">
          {block.input !== undefined && (
            <pre className="text-[10px] text-gray-500 bg-white p-1 rounded overflow-x-auto">
              {typeof block.input === 'string'
                ? block.input
                : JSON.stringify(block.input, null, 2)}
            </pre>
          )}
          {block.status === 'running' && (
            <div className="text-[10px] text-gray-400 bg-white p-1 rounded border-l-2 border-blue-200 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" />
              Waiting for result…
            </div>
          )}
          {block.status === 'failed' && block.errorMessage && (
            <pre className="text-[10px] text-red-600 bg-white p-1 rounded overflow-x-auto border-l-2 border-red-200">
              {block.errorMessage}
            </pre>
          )}
          {block.output !== undefined && block.output !== '' && (
            <pre
              className={cn(
                'text-[10px] text-gray-600 bg-white p-1 rounded overflow-x-auto border-l-2',
                block.status === 'failed' ? 'border-red-200' : 'border-emerald-200',
              )}
            >
              {block.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolCallDisplay({ toolBlocks }: ToolCallDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!toolBlocks || toolBlocks.length === 0) return null;

  const hasRunning = toolBlocks.some((b) => b.status === 'running');
  const expanded = isExpanded || hasRunning;

  return (
    <div className="mt-1.5 border-t border-gray-100 pt-1.5">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Wrench size={11} />
        <span>
          {toolBlocks.length} tool {toolBlocks.length === 1 ? 'call' : 'calls'}
        </span>
        {hasRunning && <Loader2 size={10} className="animate-spin text-blue-500" />}
      </button>

      {expanded && (
        <div className="mt-1 space-y-1">
          {toolBlocks.map((block) => (
            <ToolBlockItem key={block.id} block={block} />
          ))}
        </div>
      )}
    </div>
  );
}
