import { defineConfig } from '@playwright/test';
const base = process.env.BASE_PATH || '/';
export default defineConfig({
  testDir: './tests/browser',
  use: {
    baseURL: `http://127.0.0.1:4173${base}`,
    browserName: 'chromium',
    viewport: { width: 1365, height: 950 },
  },
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: `http://127.0.0.1:4173${base}`,
    reuseExistingServer: !process.env.CI,
  },
  reporter: 'list',
});
