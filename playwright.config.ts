import { defineConfig } from '@playwright/test'

// Two projects:
//
// - `dev` (default) runs the full e2e suite against a freshly-built dev
//   bundle. Uses globalSetup to run `npm run build` (skipped via
//   E2E_SKIP_BUILD=1).
// - `packaged` runs only the packaged-binary smoke test (`packaged.spec.ts`)
//   against the electron-builder output in `release/`. Cold-start of the
//   packaged binary is slower, especially on Windows runners, so its
//   per-test timeout is bumped to 90s. globalSetup is still wired but
//   the packaged test sets up its own state in beforeAll.
//
// Run a project explicitly:
//   npx playwright test --project=packaged
//   npx playwright test --project=dev
//
// `npm run test:e2e` runs both unless filtered (default behaviour skips
// `packaged.spec.ts` because its first `test.skip()` triggers when the
// packaged binary isn't present, but the explicit project filter is
// cleaner and avoids the skipped-test noise in dev runs).
export default defineConfig({
  testDir: './tests/e2e',
  retries: 1,
  workers: 1, // Electron doesn't support parallel execution well
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'dev',
      testIgnore: [/packaged\.spec\.ts$/],
      timeout: 60000
    },
    {
      name: 'packaged',
      testMatch: [/packaged\.spec\.ts$/],
      timeout: 90000
    }
  ]
})
