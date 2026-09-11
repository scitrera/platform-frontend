import React, {useState, createContext, useCallback,} from 'react';
import ToastComponent from '../components/UI/Toast.jsx'; // Renamed to avoid conflict
import {generateId} from "../lib/utils";


const ToastContext = createContext(null);

export const ToastProvider = ({children}) => {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    }, []);

    const addToast = useCallback((message, type = 'info', duration = 5000) => {
        const id = generateId('tst');
        setToasts(prevToasts => [...prevToasts, {id, message, type, duration}]);
        if (duration) {
            setTimeout(() => removeToast(id), duration);
        }
    }, [removeToast]);


    return (
        <ToastContext.Provider value={{addToast, removeToast}}>
            {children}
            {/* Toast container rendering logic */}
            <div className="fixed top-5 right-5 z-[100] space-y-2">
                {toasts.map(toast => (
                    <ToastComponent key={toast.id} {...toast} onDismiss={() => removeToast(toast.id)}/>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export {ToastContext};