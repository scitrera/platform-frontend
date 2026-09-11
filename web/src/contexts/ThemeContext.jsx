import React, {createContext, useContext, useState, useCallback, useEffect} from 'react';

/**
 * Default theme tokens. Each key maps to a CSS custom property: --theme-{key}.
 * Tenants can override any subset via the _theme RPC or setTheme().
 */
const DEFAULT_THEME = {
    // --- Page / Shell ---
    'page-bg': '#f9fafb',           // gray-50
    'page-text': '#111827',          // gray-900
    'page-text-secondary': '#6b7280', // gray-500
    'page-text-muted': '#9ca3af',    // gray-400

    // --- Header ---
    'header-bg': '#ffffff',
    'header-text': '#1f2937',        // gray-800
    'header-border': '#d1d5db',      // gray-300

    // --- Sidebar ---
    'sidebar-bg': '#f9fafb',         // gray-50
    'sidebar-text': '#374151',       // gray-700
    'sidebar-text-muted': '#9ca3af', // gray-400
    'sidebar-border': '#e5e7eb',     // gray-200
    'sidebar-hover-bg': '#f3f4f6',   // gray-100
    'sidebar-active-bg': '#dbeafe',  // blue-100
    'sidebar-active-text': '#1e40af', // blue-800

    // --- Brand / Accent ---
    'accent': '#2563eb',             // blue-600
    'accent-hover': '#1d4ed8',       // blue-700
    'accent-foreground': '#ffffff',
    'accent-light': '#dbeafe',       // blue-100
    'accent-muted': '#93c5fd',       // blue-300

    // --- Card ---
    'card-bg': '#ffffff',
    'card-border': '#e5e7eb',        // gray-200
    'card-shadow': '0 1px 3px 0 rgba(0,0,0,0.1)',

    // --- Input ---
    'input-bg': '#ffffff',
    'input-border': '#d1d5db',       // gray-300
    'input-focus-ring': '#3b82f6',   // blue-500
    'input-text': '#111827',
    'input-placeholder': '#9ca3af',

    // --- Borders ---
    'border': '#e5e7eb',             // gray-200
    'border-muted': '#f3f4f6',       // gray-100

    // --- Status ---
    'success': '#059669',            // emerald-600
    'success-bg': '#d1fae5',         // emerald-100
    'warning': '#d97706',            // amber-600
    'warning-bg': '#fef3c7',         // amber-100
    'error': '#dc2626',              // red-600
    'error-bg': '#fee2e2',           // red-100
    'info': '#2563eb',               // blue-600
    'info-bg': '#dbeafe',            // blue-100

    // --- Chat ---
    'chat-bg': '#ffffff',
    'chat-user-bg': '#eff6ff',       // blue-50
    'chat-ai-bg': '#f9fafb',        // gray-50
    'chat-input-bg': '#e5e7eb',      // gray-200

    // --- Misc ---
    'focus-ring': '#3b82f6',         // blue-500
    'overlay-bg': 'rgba(0,0,0,0.5)',
};

const ThemeContext = createContext(null);

/**
 * Apply theme tokens as CSS custom properties on the root element.
 */
function applyThemeToDOM(theme) {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme)) {
        root.style.setProperty(`--theme-${key}`, value);
    }
}

/**
 * ThemeProvider - manages and applies CSS custom property theme tokens.
 *
 * Usage:
 *   <ThemeProvider>
 *     <App />
 *   </ThemeProvider>
 *
 * In dynamic JSX, access via scope:
 *   setTheme({ accent: '#8b5cf6' })  // override specific tokens
 *   resetTheme()                      // revert to defaults
 */
export function ThemeProvider({initialOverrides = {}, children}) {
    const [theme, setThemeState] = useState(() => ({
        ...DEFAULT_THEME,
        ...initialOverrides,
    }));

    // Apply theme to DOM whenever it changes
    useEffect(() => {
        applyThemeToDOM(theme);
    }, [theme]);

    // Merge partial overrides into current theme
    const setTheme = useCallback((overrides) => {
        setThemeState(prev => ({...prev, ...overrides}));
    }, []);

    // Reset to defaults (with optional initial overrides preserved)
    const resetTheme = useCallback(() => {
        setThemeState({...DEFAULT_THEME, ...initialOverrides});
    }, [initialOverrides]);

    // Get a specific token value
    const getToken = useCallback((key) => {
        return theme[key] || DEFAULT_THEME[key] || '';
    }, [theme]);

    const value = {
        theme,
        setTheme,
        resetTheme,
        getToken,
        DEFAULT_THEME,
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

/**
 * Hook to access theme context.
 */
export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

export {DEFAULT_THEME};
