/**
 * Markdown renderer using streamdown — same library as the main frontend.
 * Handles streaming partial markdown gracefully.
 */
import React, { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

interface SciMarkdownProps {
  content: string;
  className?: string;
  /** When true the component is still receiving tokens; streamdown handles partial rendering. */
  isStreaming?: boolean;
}

/**
 * Thin wrapper around streamdown's web component <stream-down>.
 * streamdown registers a custom element that accepts a `content` attribute
 * and re-renders as tokens arrive — ideal for streaming LLM output.
 */
export function SciMarkdown({ content, className, isStreaming = false }: SciMarkdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  // streamdown renders via a custom element. We use a plain div and update
  // the inner HTML via the custom element API if available, otherwise fall
  // back to a <pre> for environments where streamdown isn't loaded (tests).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Check if the streamdown custom element is registered.
    if (customElements.get('stream-down')) {
      // Already rendered by the custom element below — nothing to do.
      return;
    }

    // Fallback: set text content directly.
    el.textContent = content;
  }, [content]);

  // Prefer the streamdown custom element when available; the useEffect
  // fallback handles environments where the custom element is absent.
  const isStreamDownAvailable =
    typeof customElements !== 'undefined' && customElements.get('stream-down');

  if (isStreamDownAvailable) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement('stream-down' as any, {
        content,
        class: cn('prose prose-sm max-w-none break-words', className),
        streaming: isStreaming ? 'true' : undefined,
      })
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        'prose prose-sm max-w-none break-words whitespace-pre-wrap text-gray-800',
        className,
      )}
    />
  );
}
