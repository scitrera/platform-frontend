import React from 'react';

const VARIANT_CLASSES = {
    default: 'bg-gray-100 text-gray-700 border-gray-300',
    primary: 'bg-blue-100 text-blue-800 border-blue-300',
    success: 'bg-green-100 text-green-800 border-green-300',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    danger: 'bg-red-100 text-red-800 border-red-300',
    info: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    purple: 'bg-purple-100 text-purple-800 border-purple-300',
};

/**
 * Badge - generic label/tag component.
 * @param {string} [variant='default'] - color variant
 * @param {string} [className] - additional CSS classes
 * @param {React.ReactNode} children - badge content
 */
export const Badge = ({variant = 'default', className = '', children, ...props}) => {
    const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.default;
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${variantClass} ${className}`}
            {...props}
        >
            {children}
        </span>
    );
};

export default Badge;
