import {defineConfig, devices} from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: true, forbidOnly: !!process.env.CI,
  retries: 0, workers: 2, reporter: 'list',
  use: {baseURL: 'http://127.0.0.1:4178', trace: 'retain-on-failure', screenshot: 'only-on-failure'},
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  webServer: {
    // Always build against synthetic same-origin services, including with local overrides.
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4178 --strictPort',
    env: {VITE_AUTH_ORIGIN: '', VITE_WS_ORIGIN: '', VITE_WS_TENANT_PATH: 'true', VITE_WS_TRANSPORT: 'websocket', VITE_SENTRY_DSN: ''},
    url: 'http://127.0.0.1:4178', reuseExistingServer: false, timeout: 120_000,
  },
});
