/**
 * Message input: textarea + send button.
 * Cmd/Ctrl+Enter or Enter (configurable) to send.
 * Disabled when not authenticated or not connected.
 */
import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ConnectionState } from '../../state/chat';

interface MessageInputProps {
  onSend: (text: string) => void;
  onCancel: () => void;
  connectionState: ConnectionState;
  isStreaming: boolean;
  authStatus: 'idle' | 'loading' | 'authenticated' | 'error';
  /** Extra disabled flag — e.g. when no workspace is selected. */
  disabled?: boolean;
}

export function MessageInput({
  onSend,
  onCancel,
  connectionState,
  isStreaming,
  authStatus,
  disabled = false,
}: MessageInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend =
    value.trim().length > 0 &&
    connectionState === 'connected' &&
    authStatus === 'authenticated' &&
    !isStreaming &&
    !disabled;

  // Auto-resize textarea up to ~6 lines
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    ta.style.height = Math.min(ta.scrollHeight, lineHeight * 6) + 'px';
  }, [value]);

  const handleSend = () => {
    const text = value.trim();
    if (!text || !canSend) return;
    onSend(text);
    setValue('');
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      // Cmd/Ctrl+Enter always sends; bare Enter also sends unless Shift is held
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        handleSend();
      } else if (!e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      // Shift+Enter = newline
    }
  };

  const placeholderText = (() => {
    if (authStatus === 'loading') return 'Signing in…';
    if (authStatus === 'error') return 'Sign-in failed — click auth required';
    if (connectionState === 'auth-required') return 'Sign-in required';
    if (connectionState === 'connecting' || connectionState === 'reconnecting')
      return 'Connecting…';
    if (connectionState === 'offline') return 'Offline';
    if (disabled) return 'Select a workspace to start chatting…';
    if (isStreaming) return 'Waiting for response…';
    return 'Ask something… (Enter to send)';
  })();

  return (
    <div className="border-t border-gray-200 bg-white p-2 flex-shrink-0">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          rows={1}
          disabled={!canSend && value.length === 0}
          className={cn(
            'flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-blue-400',
            'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed',
            'min-h-[36px]',
          )}
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-lg transition-colors flex-shrink-0 self-end bg-red-500 text-white hover:bg-red-600"
            title="Stop response"
            aria-label="Stop response"
          >
            <Square size={16} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              'p-2 rounded-lg transition-colors flex-shrink-0 self-end',
              canSend
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            )}
            title="Send message (Enter)"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
