import React from 'react';

const STATUS_VARIANTS = {
    working: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    running: 'bg-blue-100 text-blue-800 border-blue-300',
    processing: 'bg-blue-100 text-blue-800 border-blue-300',
    complete: 'bg-green-100 text-green-800 border-green-300',
    done: 'bg-green-100 text-green-800 border-green-300',
    success: 'bg-green-100 text-green-800 border-green-300',
    failed: 'bg-red-100 text-red-800 border-red-300',
    error: 'bg-red-100 text-red-800 border-red-300',
    cancelled: 'bg-gray-100 text-gray-600 border-gray-300',
    idle: 'bg-gray-100 text-gray-600 border-gray-300',
    ready: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    needs_input: 'bg-purple-100 text-purple-800 border-purple-300',
};

const DEFAULT_VARIANT = 'bg-gray-100 text-gray-700 border-gray-300';

/**
 * StatusBadge - displays a colored status indicator.
 * @param {string} status - the status key (e.g. "working", "complete", "failed")
 * @param {string} [label] - optional override label; defaults to the status string
 * @param {string} [className] - additional CSS classes
 * @param {boolean} [pulse] - show a pulsing dot for active statuses
 */
export const StatusBadge = ({status, label, className = '', pulse = false, ...props}) => {
    const normalized = (status || '').toLowerCase().replace(/[\s-]/g, '_');
    const variantClass = STATUS_VARIANTS[normalized] || DEFAULT_VARIANT;
    const displayLabel = label || status || 'unknown';
    const showPulse = pulse || ['working', 'running', 'processing', 'pending'].includes(normalized);

    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantClass} ${className}`}
            {...props}
        >
            {showPulse && (
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"/>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-current"/>
                </span>
            )}
            {displayLabel}
        </span>
    );
};

export default StatusBadge;
