import {defineConfig, loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';

// No identity header injection. Targets must be an authenticated gateway/auth-go.
export default defineConfig(({mode}) => {
    const env = loadEnv(mode, process.cwd(), 'DEV_');
    const proxy = {};
    if (env.DEV_AUTH_TARGET) proxy['/api/auth'] = {
        target: env.DEV_AUTH_TARGET, changeOrigin: true,
        rewrite: p => p.replace(/^\/api\/auth/, ''),
    };
    if (env.DEV_GATEWAY_TARGET) proxy['^/(?:[^/]+/)?rfe1-ws'] = {
        target: env.DEV_GATEWAY_TARGET, ws: true, changeOrigin: true,
    };
    return {
        base: '/',
        plugins: [react()],
        server: {
            host: '127.0.0.1', proxy,
            https: env.DEV_TLS_CERT && env.DEV_TLS_KEY ? {
                cert: fs.readFileSync(env.DEV_TLS_CERT), key: fs.readFileSync(env.DEV_TLS_KEY),
            } : undefined,
        },
        resolve: {alias: {'@': path.resolve(import.meta.dirname, 'src')}, dedupe: ['react', 'react-dom']},
        optimizeDeps: {include: ['react', 'react-dom']},
        build: {cssCodeSplit: false, sourcemap: false},
        // Source archives also build: no dependency on a Git checkout or private history.
        define: {__GIT_COMMIT_HASH__: JSON.stringify(process.env.BUILD_REVISION || 'source')},
    };
});
