import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  workers: 1, // Electron doesn't support parallel execution well
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    trace: 'on-first-retry',
  },
});
