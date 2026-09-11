import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';

/**
 * ConfirmDialog - modal confirmation using Radix Dialog.
 * @param {boolean} open - controlled open state
 * @param {function} onOpenChange - called with new open state
 * @param {string} [title='Confirm'] - dialog title
 * @param {string|React.ReactNode} [description] - descriptive text
 * @param {string} [confirmLabel='Confirm'] - confirm button text
 * @param {string} [cancelLabel='Cancel'] - cancel button text
 * @param {string} [variant='danger'] - 'danger' or 'primary' (affects confirm button color)
 * @param {function} onConfirm - called when confirm is clicked
 * @param {function} [onCancel] - called when cancel is clicked
 */
export const ConfirmDialog = ({
    open,
    onOpenChange,
    title = 'Confirm',
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'danger',
    onConfirm,
    onCancel,
    children,
}) => {
    const confirmBtnClass = variant === 'danger'
        ? 'bg-red-600 hover:bg-red-700 text-white'
        : 'bg-blue-600 hover:bg-blue-700 text-white';

    const handleConfirm = () => {
        onConfirm?.();
        onOpenChange?.(false);
    };

    const handleCancel = () => {
        onCancel?.();
        onOpenChange?.(false);
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            {children && <Dialog.Trigger asChild>{children}</Dialog.Trigger>}
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 animate-fadeIn"/>
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                    <Dialog.Title className="text-lg font-semibold text-gray-900">
                        {title}
                    </Dialog.Title>
                    {description && (
                        <Dialog.Description className="mt-2 text-sm text-gray-600">
                            {description}
                        </Dialog.Description>
                    )}
                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            onClick={handleCancel}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                        >
                            {cancelLabel}
                        </button>
                        <button
                            onClick={handleConfirm}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${confirmBtnClass}`}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

export default ConfirmDialog;
