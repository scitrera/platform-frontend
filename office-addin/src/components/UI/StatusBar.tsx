import React from 'react';
import { cn } from '../../lib/utils';
import type { ConnectionState } from '../../state/chat';

interface StatusBarProps {
  state: ConnectionState;
}

const config: Record<ConnectionState, { label: string; className: string }> = {
  connected: {
    label: 'Connected',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  connecting: {
    label: 'Connecting…',
    className: 'bg-blue-50 text-blue-600 border-blue-200',
  },
  reconnecting: {
    label: 'Reconnecting…',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  'auth-required': {
    label: 'Auth required',
    className: 'bg-red-50 text-red-600 border-red-200',
  },
  offline: {
    label: 'Offline',
    className: 'bg-gray-100 text-gray-500 border-gray-200',
  },
};

export function StatusBar({ state }: StatusBarProps) {
  const { label, className } = config[state] ?? config['offline'];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium flex-shrink-0',
        className,
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          state === 'connected' ? 'bg-emerald-500' :
          state === 'connecting' || state === 'reconnecting' ? 'bg-amber-400 animate-pulse' :
          'bg-gray-400',
        )}
      />
      {label}
    </span>
  );
}
