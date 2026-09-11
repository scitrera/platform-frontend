import React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import {Clock, Loader2, AlertCircle} from 'lucide-react';

/**
 * Props for the TaskProgress component
 // * @param {string} title - Descriptive title of the task
 // * @param {number} progress - Completion between 0 and 1; -1 for indeterminate
 // * @param {string} [stepName] - Optional description of current state
 // * @param {'pending' | 'running' | 'failed'} state - Task state
 */
export const TaskStatusCard = ({task}) => {
    if (task === null) {
        return (<></>); // empty if not defined
    }
    const {name: title, progress, message: stepName, status: state} = task;
    // Configuration for different states
    const stateConfig = {
        pending: {
            textColor: 'text-gray-500',
            icon: <Clock className="w-4 h-4 text-gray-500"/>,
            barColor: 'bg-gray-500',
        },
        running: {
            textColor: 'text-blue-500',
            icon: <Loader2 className="w-4 h-4 animate-spin text-blue-500"/>,
            barColor: 'bg-blue-500',
        },
        failed: {
            textColor: 'text-red-500',
            icon: <AlertCircle className="w-4 h-4 text-red-500"/>,
            barColor: 'bg-red-500',
        },
    };

    const config = stateConfig[state] || stateConfig.pending;

    // Determine Radix progress props
    const isIndeterminate = progress === undefined || progress === null || progress < 0;
    const value = !isIndeterminate ? Math.min(Math.max(progress * 100, 0), 100) : null;

    return (
        <div className="space-y-1">
            <div className="flex items-center space-x-2">
                {config.icon}
                <h3 className="font-medium text-base">{title}</h3>
            </div>
            <ProgressPrimitive.Root
                className="relative h-2 w-full bg-gray-200 rounded overflow-hidden"
                value={value}
            >
                <ProgressPrimitive.Indicator
                    className={`h-full ${config.barColor} transition-all duration-300 ease-in-out`}
                    style={value !== null ? {width: `${value}%`} : {}}
                />
            </ProgressPrimitive.Root>
            {stepName && <p className="text-sm text-gray-600">{stepName}</p>}
        </div>
    );
};

export default TaskStatusCard;
