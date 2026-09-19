import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ThemeProvider, useTheme} from './theme-provider';
import {ThemeToggle} from './theme-toggle';

const storageKey = 'scitrera-ui-theme';
let systemDark: boolean;
let systemListeners: Set<() => void>;

function Controls() {
    const {theme, resolvedTheme, setTheme} = useTheme();
    return <>
        <output>{theme}/{resolvedTheme}</output>
        <button onClick={() => setTheme('dark')}>Set dark programmatically</button>
        <ThemeToggle/>
    </>;
}

function changeSystemTheme(dark: boolean) {
    act(() => {
        systemDark = dark;
        systemListeners.forEach(listener => listener());
    });
}

beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('light', 'dark');
    systemDark = true;
    systemListeners = new Set();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
        get matches() { return systemDark; },
        addEventListener: (_event: string, listener: () => void) => systemListeners.add(listener),
        removeEventListener: (_event: string, listener: () => void) => systemListeners.delete(listener),
    })));
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('tenant theme policy', () => {
    it.each(['dark', 'system'])('locks light over a saved %s preference without changing that preference', saved => {
        localStorage.setItem(storageKey, saved);
        render(<ThemeProvider forcedTheme="light"><Controls/></ThemeProvider>);
        expect(screen.getByText('light/light')).toBeInTheDocument();
        expect(document.documentElement).toHaveClass('light');
        expect(document.documentElement).not.toHaveClass('dark');
        expect(screen.queryByTitle(/^Theme:/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('Set dark programmatically'));
        changeSystemTheme(false);
        changeSystemTheme(true);
        expect(document.documentElement).toHaveClass('light');
        expect(screen.getByText('light/light')).toBeInTheDocument();
        expect(localStorage.getItem(storageKey)).toBe(saved);
    });

    it('applies a policy arriving with the profile and restores the preference when it is removed', () => {
        localStorage.setItem(storageKey, 'dark');
        const view = render(<ThemeProvider><Controls/></ThemeProvider>);
        expect(document.documentElement).toHaveClass('dark');
        expect(screen.getByTitle('Theme: Dark')).toBeInTheDocument();
        view.rerender(<ThemeProvider forcedTheme="light"><Controls/></ThemeProvider>);
        expect(document.documentElement).toHaveClass('light');
        expect(screen.queryByTitle(/^Theme:/)).not.toBeInTheDocument();
        view.rerender(<ThemeProvider><Controls/></ThemeProvider>);
        expect(document.documentElement).toHaveClass('dark');
        expect(screen.getByTitle('Theme: Dark')).toBeInTheDocument();
    });

    it('supports a fixed dark theme independently of the OS and saved light preference', () => {
        systemDark = false;
        localStorage.setItem(storageKey, 'light');
        render(<ThemeProvider forcedTheme="dark"><Controls/></ThemeProvider>);
        expect(document.documentElement).toHaveClass('dark');
        expect(screen.getByText('dark/dark')).toBeInTheDocument();
        expect(screen.queryByTitle(/^Theme:/)).not.toBeInTheDocument();
        expect(localStorage.getItem(storageKey)).toBe('light');
    });

    it('continues to follow system changes and allow manual selection without a tenant policy', () => {
        render(<ThemeProvider><Controls/></ThemeProvider>);
        expect(screen.getByText('system/dark')).toBeInTheDocument();
        changeSystemTheme(false);
        expect(document.documentElement).toHaveClass('light');
        expect(screen.getByText('system/light')).toBeInTheDocument();
        fireEvent.click(screen.getByTitle('Theme: System'));
        expect(screen.getByText('light/light')).toBeInTheDocument();
        expect(localStorage.getItem(storageKey)).toBe('light');
        fireEvent.click(screen.getByTitle('Theme: Light'));
        expect(screen.getByText('dark/dark')).toBeInTheDocument();
        expect(localStorage.getItem(storageKey)).toBe('dark');
        changeSystemTheme(true);
        changeSystemTheme(false);
        expect(document.documentElement).toHaveClass('dark');
    });

    it('restores the current system preference after a policy is removed', () => {
        const view = render(<ThemeProvider forcedTheme="light"><Controls/></ThemeProvider>);
        changeSystemTheme(false);
        changeSystemTheme(true);
        view.rerender(<ThemeProvider><Controls/></ThemeProvider>);
        expect(screen.getByText('system/dark')).toBeInTheDocument();
        expect(document.documentElement).toHaveClass('dark');
        expect(localStorage.getItem(storageKey)).toBeNull();
    });
});
