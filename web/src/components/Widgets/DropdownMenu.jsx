import React, {useState, useRef, useEffect, useCallback} from 'react';

/**
 * DropdownMenu - lightweight dropdown (no Radix dependency).
 *
 * Usage:
 *   <DropdownMenu
 *     trigger={<Button>Actions</Button>}
 *     items={[
 *       { label: 'Edit', onClick: () => {} },
 *       { label: 'Delete', onClick: () => {}, variant: 'danger' },
 *       { type: 'separator' },
 *       { label: 'Export', onClick: () => {} },
 *     ]}
 *   />
 *
 * @param {React.ReactNode} trigger - the button/element that opens the menu
 * @param {Array<{label?: string, onClick?: function, icon?: React.ReactNode, variant?: string, disabled?: boolean, type?: 'separator'}>} items
 * @param {string} [align='left'] - 'left' or 'right' alignment
 * @param {string} [className] - additional wrapper classes
 */
export const DropdownMenu = ({trigger, items = [], align = 'left', className = ''}) => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);

    const handleClickOutside = useCallback((e) => {
        if (menuRef.current && !menuRef.current.contains(e.target)) {
            setOpen(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [open, handleClickOutside]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') setOpen(false);
    }, []);

    return (
        <div ref={menuRef} className={`relative inline-block ${className}`} onKeyDown={handleKeyDown}>
            <div onClick={() => setOpen(prev => !prev)} className="cursor-pointer">
                {trigger}
            </div>
            {open && (
                <div
                    className={`absolute z-50 mt-1 min-w-[160px] bg-white border border-gray-200 rounded-md shadow-lg py-1 ${
                        align === 'right' ? 'right-0' : 'left-0'
                    }`}
                    role="menu"
                >
                    {items.map((item, i) => {
                        if (item.type === 'separator') {
                            return <div key={i} className="my-1 border-t border-gray-100"/>;
                        }
                        const variantClass = item.variant === 'danger'
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-gray-700 hover:bg-gray-50';
                        return (
                            <button
                                key={i}
                                role="menuitem"
                                disabled={item.disabled}
                                onClick={() => {
                                    setOpen(false);
                                    item.onClick?.();
                                }}
                                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${variantClass} ${
                                    item.disabled ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default DropdownMenu;
