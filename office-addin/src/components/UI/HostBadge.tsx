import React from 'react';
import { FileSpreadsheet, FileText, Presentation } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { OfficeHost } from '../../host/detect';

interface HostBadgeProps {
  host: OfficeHost;
}

const hostConfig: Record<OfficeHost, { label: string; icon: React.ElementType; className: string }> = {
  EXCEL: {
    label: 'Excel',
    icon: FileSpreadsheet,
    className: 'text-emerald-700 bg-emerald-50',
  },
  WORD: {
    label: 'Word',
    icon: FileText,
    className: 'text-blue-700 bg-blue-50',
  },
  POWERPOINT: {
    label: 'PowerPoint',
    icon: Presentation,
    className: 'text-orange-700 bg-orange-50',
  },
  OUTLOOK: {
    label: 'Outlook',
    icon: FileText,
    className: 'text-blue-600 bg-blue-50',
  },
  UNKNOWN: {
    label: 'Preview',
    icon: FileText,
    className: 'text-gray-600 bg-gray-100',
  },
};

export function HostBadge({ host }: HostBadgeProps) {
  const { label, icon: Icon, className } = hostConfig[host] ?? hostConfig['UNKNOWN'];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        className,
      )}
    >
      <Icon size={12} />
      {label}
    </span>
  );
}
