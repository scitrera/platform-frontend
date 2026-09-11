import React, {useState, useCallback} from 'react';

/**
 * Tabs - lightweight tab component (no Radix dependency).
 *
 * Usage:
 *   <Tabs defaultValue="tab1" tabs={[
 *     { value: 'tab1', label: 'First Tab', content: <div>Content 1</div> },
 *     { value: 'tab2', label: 'Second Tab', content: <div>Content 2</div> },
 *   ]} />
 *
 * Or controlled:
 *   <Tabs value={activeTab} onValueChange={setActiveTab} tabs={[...]} />
 *
 * @param {Array<{value: string, label: string|React.ReactNode, content: React.ReactNode, disabled?: boolean}>} tabs
 * @param {string} [defaultValue] - initial active tab (uncontrolled)
 * @param {string} [value] - active tab (controlled)
 * @param {function} [onValueChange] - called with new tab value
 * @param {string} [className] - additional wrapper classes
 */
export const Tabs = ({tabs = [], defaultValue, value, onValueChange, className = ''}) => {
    const [internalValue, setInternalValue] = useState(defaultValue || tabs[0]?.value);
    const isControlled = value !== undefined;
    const activeValue = isControlled ? value : internalValue;

    const handleChange = useCallback((newValue) => {
        if (!isControlled) setInternalValue(newValue);
        onValueChange?.(newValue);
    }, [isControlled, onValueChange]);

    const activeTab = tabs.find(t => t.value === activeValue);

    return (
        <div className={className}>
            <div className="flex border-b border-gray-200" role="tablist">
                {tabs.map(tab => (
                    <button
                        key={tab.value}
                        role="tab"
                        aria-selected={tab.value === activeValue}
                        disabled={tab.disabled}
                        onClick={() => handleChange(tab.value)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            tab.value === activeValue
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        } ${tab.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="pt-4" role="tabpanel">
                {activeTab?.content}
            </div>
        </div>
    );
};

export default Tabs;
