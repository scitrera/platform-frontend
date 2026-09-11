import React from 'react';
import {ErrorBoundary} from 'react-error-boundary';
import {WebSocketProvider} from './contexts/WebSocketContext.jsx';
import {ToastProvider} from './contexts/ToastContext.jsx';
import {ChatStateProvider} from "./hooks/useChatState";
import {KnowledgebaseProvider} from './contexts/KnowledgebaseContext';
import {LibraryProvider} from './contexts/LibraryContext';
import {ThemeProvider} from './contexts/ThemeContext.jsx';
import {ThemeProvider as ShadcnThemeProvider} from './components/ui/theme-provider';
import Layout from './components/UI/Layout.jsx';
import '@fontsource-variable/geist';
import './App.css';

function GlobalErrorFallback({error, resetErrorBoundary}) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
                <h1 className="text-xl font-semibold text-red-600 mb-2">Something went wrong</h1>
                <p className="text-sm text-gray-600 mb-4">{error?.message || 'An unexpected error occurred.'}</p>
                <button
                    onClick={resetErrorBoundary}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                    Reload Application
                </button>
            </div>
        </div>
    );
}

function App() {
    return (
        <ErrorBoundary FallbackComponent={GlobalErrorFallback} onReset={() => window.location.reload()}>
            <ShadcnThemeProvider defaultTheme="system" storageKey="scitrera-ui-theme">
                <ThemeProvider>
                    <ChatStateProvider>
                        <WebSocketProvider>
                            <KnowledgebaseProvider>
                                <LibraryProvider>
                                    <ToastProvider>
                                        <Layout/>
                                    </ToastProvider>
                                </LibraryProvider>
                            </KnowledgebaseProvider>
                        </WebSocketProvider>
                    </ChatStateProvider>
                </ThemeProvider>
            </ShadcnThemeProvider>
        </ErrorBoundary>
    );
}

export default App;
