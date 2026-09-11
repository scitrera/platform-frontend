/**
 * "Thinking" pill — visible while an agent task is in flight.
 * Mirrors MessageProgress.jsx from the main frontend.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader } from 'lucide-react';
import type { ProgressInfo } from '../../state/chat';

interface MessageProgressProps {
  progress: ProgressInfo | null;
  isStreaming: boolean;
}

export function MessageProgress({ progress, isStreaming }: MessageProgressProps) {
  const [elapsed, setElapsed] = useState('0.0');
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      // Reset start time; elapsed resets via the interval cleanup below.
      startRef.current = null;
      return;
    }
    if (startRef.current === null) {
      startRef.current = Date.now();
    }
    // Tick every 100 ms — setState inside the interval callback is safe.
    const interval = setInterval(() => {
      setElapsed(((Date.now() - (startRef.current ?? Date.now())) / 1000).toFixed(1));
    }, 100);
    return () => {
      clearInterval(interval);
      // Reset display when streaming stops (runs after the interval cleanup).
      setElapsed('0.0');
    };
  }, [isStreaming]);

  if (!isStreaming) return null;

  const detail = progress?.summary;
  const label = detail ? `Thinking (${detail})` : 'Thinking';

  return (
    <div className="w-full flex justify-start px-1">
      <div className="flex items-start gap-2 text-sm text-gray-700 max-w-full">
        <Loader className="animate-spin mt-0.5 size-3.5 shrink-0 text-blue-500" />
        <div className="flex flex-col">
          <div className="font-medium leading-tight text-xs">
            {label}{' '}
            <span className="ml-1 text-[10px] text-gray-400">{elapsed}s</span>
          </div>
          {progress?.completion !== undefined && (
            <div className="mt-0.5 w-32 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400 rounded-full transition-all"
                style={{ width: `${Math.round(progress.completion * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
