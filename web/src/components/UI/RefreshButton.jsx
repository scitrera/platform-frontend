import React, {useState, useRef, useCallback} from 'react';
import {RotateCw} from 'lucide-react';
import {DEBUG_MODE} from "../../constants/AppConstants";

/**
 * RefreshButton component with built-in throttling and animation
 * @param {Function} onRefresh - Function to call when refresh is triggered
 * @param {number} throttleMs - Minimum time between refresh calls (default: 500ms)
 * @param {string} title - Tooltip text for the button
 * @param {boolean} disabled - Whether the button is disabled
 * @param {string} className - Additional CSS classes
 */
const RefreshButton = ({
                           onRefresh,
                           throttleMs = 500,
                           title = "Refresh",
                           disabled = false,
                           className = "p-1 rounded hover:bg-gray-100 text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400",
                           ...props
                       }) => {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const lastRequestTimeRef = useRef(0);

    const handleRefresh = useCallback(async (throttleCheck = true) => {
        const now = Date.now();
        const elapsed = now - lastRequestTimeRef.current;

        if (throttleCheck && elapsed < throttleMs) {
            return; // Throttle
        }

        DEBUG_MODE && console.log('setIsRefreshing(true);')
        lastRequestTimeRef.current = now;
        setIsRefreshing(true);

        try {
            await onRefresh();
        } finally {
            DEBUG_MODE && console.log('setIsRefreshing(false);')
            setIsRefreshing(false);
        }
    }, [onRefresh, throttleMs]);

    return (
        <button
            onClick={() => handleRefresh()}
            className={className}
            title={title}
            disabled={disabled || isRefreshing}
            {...props}
        >
            {isRefreshing ? (
                <RotateCw size={16} className="animate-spin transform text-blue-500"/>
            ) : (
                <RotateCw size={16}/>
            )}
        </button>
    );
};

export default RefreshButton;