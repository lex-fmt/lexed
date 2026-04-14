import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp, type AppLaunchOptions } from '../helpers'

/**
 * Playwright fixture that provides a fresh Electron app + page per test,
 * with guaranteed cleanup regardless of test outcome.
 *
 * Usage:
 *   import { test, expect } from './lib'
 *
 *   test('my test', async ({ electronApp, page }) => { ... })
 *
 * To customize launch options for a describe block:
 *   test.use({ launchOptions: { env: { LEX_DISABLE_PERSISTENCE: '0' } } })
 */
export type AppFixtures = {
  electronApp: ElectronApplication
  page: Page
  launchOptions: AppLaunchOptions
}

const defaultLaunchOptions: AppLaunchOptions = {
  env: { LEX_DISABLE_PERSISTENCE: '1' },
}

export const test = base.extend<AppFixtures>({
  // eslint-disable-next-line no-empty-pattern
  launchOptions: [({}, use) => use(defaultLaunchOptions), { option: true }],
  electronApp: async ({ launchOptions }, use) => {
    const app = await launchApp(launchOptions)
    await use(app)
    await app.close()
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  },
})

export { expect } from '@playwright/test'
