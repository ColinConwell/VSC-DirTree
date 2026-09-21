import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test',
  testMatch: 'workbench.spec.ts',
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: process.env.DIRTREE_WORKBENCH_URL || 'http://localhost:3002',
    viewport: { width: 1280, height: 850 },
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: process.env.DIRTREE_WORKBENCH_URL
    ? undefined
    : {
        command: 'node scripts/dev.mjs',
        url: 'http://localhost:3002',
        env: { PORT: '3002' },
        timeout: 120000,
        reuseExistingServer: !process.env.CI,
      },
  reporter: 'list',
});
