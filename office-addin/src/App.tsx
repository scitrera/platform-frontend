import React from 'react';
import { AuthProvider } from './auth/auth-context';
import ChatApp from './components/Chat/ChatApp';
import ErrorBoundary from './components/Boundary/ErrorBoundary';

interface AppProps {
  officeReady: boolean;
}

export default function App({ officeReady }: AppProps) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <div className="h-screen flex flex-col overflow-hidden bg-white text-gray-900 text-sm">
          {!officeReady && (
            <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs text-amber-700 flex-shrink-0">
              Office context not detected — running in browser preview mode.
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <ChatApp />
          </div>
        </div>
      </AuthProvider>
    </ErrorBoundary>
  );
}
