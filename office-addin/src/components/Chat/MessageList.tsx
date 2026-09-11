/**
 * Scrollable message list.
 * Spec-driven: consumes an ordered array of spec ``ChatMessage``s.
 */
import React, { useEffect, useRef } from 'react';
import type { ChatMessage } from '@scitrera/messaging-spec';
import { MessageItem } from './MessageItem';
import { MessageProgress } from './MessageProgress';
import type { ProgressInfo } from '../../state/chat';

interface MessageListProps {
  messages: ChatMessage[];
  progress: ProgressInfo | null;
  isStreaming: boolean;
}

export function MessageList({ messages, progress, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // Track manual scroll-up so we don't fight the user.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 60;
      userScrolledUpRef.current = !isAtBottom;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-scroll to bottom when messages grow or tokens stream in.
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isStreaming]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
    >
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <p className="text-xs text-gray-400 text-center px-4">
            Ask me anything about your document — I can read and edit it for you.
          </p>
        </div>
      )}
      {messages.map((msg) => (
        <MessageItem key={msg.id} msg={msg} />
      ))}
      <MessageProgress progress={progress} isStreaming={isStreaming} />
      <div ref={bottomRef} />
    </div>
  );
}
