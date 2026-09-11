import React from 'react';
import { Info, CheckCircle, AlertCircle, XCircle, X } from 'lucide-react';

// The visual component for an individual toast notification.
const Toast = ({ message, type, onDismiss }) => {
    const typeStyles = {
        info: {
            bgColor: 'bg-blue-500',
            Icon: Info,
        },
        success: {
            bgColor: 'bg-green-500',
            Icon: CheckCircle,
        },
        warning: {
            bgColor: 'bg-yellow-500',
            Icon: AlertCircle,
        },
        error: {
            bgColor: 'bg-red-500',
            Icon: XCircle,
        },
    };

    const currentStyle = typeStyles[type] || typeStyles.info;

    return (
        <div
            className={`flex items-center p-4 rounded-lg shadow-lg text-white ${currentStyle.bgColor} transition-all duration-300 ease-out animate-fadeIn`}
            role="alert"
        >
            <currentStyle.Icon className="w-6 h-6 mr-3 flex-shrink-0" aria-hidden="true" />
            <span className="flex-grow text-sm">{message}</span>
            <button
                onClick={onDismiss}
                className="ml-4 p-1 rounded-full hover:bg-white/20 flex-shrink-0"
                aria-label="Dismiss notification"
            >
                <X size={18} />
            </button>
        </div>
    );
};

export default Toast;