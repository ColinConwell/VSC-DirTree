import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test',
  testMatch: 'ui.spec.ts',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4317', viewport: { width: 320, height: 760 }, headless: true },
  webServer: {
    command: 'node scripts/ui-server.mjs',
    url: 'http://127.0.0.1:4317',
    reuseExistingServer: !process.env.CI,
  },
  reporter: 'list',
  timeout: 30000,
});
