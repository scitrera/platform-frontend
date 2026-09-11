import React, {useRef} from 'react';
import {Search, X} from 'lucide-react';

/**
 * SearchInput - search input with icon and clear button.
 * @param {string} value - current search value
 * @param {function} onChange - called with new value
 * @param {string} [placeholder='Search...'] - placeholder text
 * @param {string} [className] - additional CSS classes
 * @param {number} [debounceMs] - optional debounce (not built-in; use with external debounce)
 */
export const SearchInput = ({value, onChange, placeholder = 'Search...', className = '', ...props}) => {
    const inputRef = useRef(null);

    const handleClear = () => {
        onChange('');
        inputRef.current?.focus();
    };

    return (
        <div className={`relative ${className}`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16}/>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                {...props}
            />
            {value && (
                <button
                    type="button"
                    onClick={handleClear}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded"
                    title="Clear search"
                >
                    <X size={14}/>
                </button>
            )}
        </div>
    );
};

export default SearchInput;
