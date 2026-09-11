import {useState, useCallback} from 'react';

/**
 * useLocalStorage - React hook for localStorage-backed state.
 *
 * @param {string} key - localStorage key
 * @param {any} defaultValue - default value if key is not set
 * @returns {[any, function, function]} [value, setValue, removeValue]
 */
export function useLocalStorage(key, defaultValue) {
    const [storedValue, setStoredValue] = useState(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item !== null ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    });

    const setValue = useCallback((value) => {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        try {
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch {
            // Ignore storage quota errors
        }
    }, [key, storedValue]);

    const removeValue = useCallback(() => {
        setStoredValue(defaultValue);
        try {
            window.localStorage.removeItem(key);
        } catch {
            // Ignore errors
        }
    }, [key, defaultValue]);

    return [storedValue, setValue, removeValue];
}
