import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/e2e', use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium' }, webServer: [
  {
    command: 'npm run dev:api',
    url: 'http://127.0.0.1:3001/health/live',
    reuseExistingServer: false,
    // E2E only checks liveness; these inert values satisfy startup validation
    // without connecting to a database or an OAuth provider.
    env: {
      PORT: '3001',
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://127.0.0.1/not-used',
      AUTH_GITHUB_CLIENT_ID: 'e2e-client',
      AUTH_GITHUB_CLIENT_SECRET: 'e2e-secret',
      AUTH_GITHUB_CALLBACK_URL: 'http://127.0.0.1:5173/auth/github/callback',
      FRONTEND_ORIGIN: 'http://127.0.0.1:5173'
    }
  },
  { command: 'npm run dev:web', url: 'http://127.0.0.1:5173', reuseExistingServer: false }
] });
