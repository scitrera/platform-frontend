import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 3000,
    // TLS files are explicit local inputs, never read from a home directory.
    https: process.env['DEV_TLS_CERT'] && process.env['DEV_TLS_KEY'] ? {
      cert: fs.readFileSync(process.env['DEV_TLS_CERT']),
      key: fs.readFileSync(process.env['DEV_TLS_KEY']),
    } : undefined,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        commands: path.resolve(import.meta.dirname, 'src/commands/commands.html'),
        'auth-dialog': path.resolve(import.meta.dirname, 'auth-dialog.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Provide dummy build-time env so modules that read src/lib/env.ts (which
    // throws when VITE_ENTRA_CLIENT_ID is unset) can be imported under test.
    env: {
      VITE_ENTRA_CLIENT_ID: '00000000-0000-0000-0000-000000000000',
      VITE_ENTRA_AUTHORITY: 'https://login.microsoftonline.com/common/v2.0',
      VITE_TOOLS_WSS_URL: 'wss://tools-wss.test/v1/connect',
    },
  },
});
