import { useContext } from 'react';
// Adjust the import path if your ToastContext.js is in a different location.
import { ToastContext } from '../contexts/ToastContext.jsx';

export const useToasts = () => {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToasts must be used within a ToastProvider');
    }
    return context;
};