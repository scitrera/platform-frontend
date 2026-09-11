import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from "@sentry/react";
import "streamdown/styles.css";
import "katex/dist/katex.min.css";
import App from './App.jsx';

// Telemetry is opt-in and receives no default PII or distributed traces.
if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({dsn: import.meta.env.VITE_SENTRY_DSN, sendDefaultPii: false});
}

// React.StrictMode has been removed to prevent duplicate rendering of components
// which was causing multiple WebSocketContext instances to be created.
// This was leading to continuous disconnects in the WebSocket connection.
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
