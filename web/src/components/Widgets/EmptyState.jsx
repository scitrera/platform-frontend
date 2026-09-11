import React from 'react';
import LazyLucideIcon from '../UI/LazyLucideIcon.jsx';

/**
 * EmptyState - placeholder when a list or area has no content.
 * @param {string} [icon='inbox'] - Lucide icon name
 * @param {string} [title='No items'] - heading text
 * @param {string} [description] - optional subtitle
 * @param {React.ReactNode} [action] - optional action button/element
 * @param {string} [className] - additional CSS classes
 */
export const EmptyState = ({icon = 'inbox', title = 'No items', description, action, className = ''}) => {
    return (
        <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
            <LazyLucideIcon name={icon} size={48} className="text-gray-300 mb-4"/>
            <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
            {description && <p className="text-xs text-gray-400 mb-4 max-w-xs">{description}</p>}
            {action}
        </div>
    );
};

export default EmptyState;
