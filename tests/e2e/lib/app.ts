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
 *   test.use({ appLaunchOptions: { env: { LEX_DISABLE_PERSISTENCE: '0' } } })
 */
export type AppFixtures = {
  electronApp: ElectronApplication
  page: Page
  appLaunchOptions: AppLaunchOptions
}

const defaultAppLaunchOptions: AppLaunchOptions = {
  env: { LEX_DISABLE_PERSISTENCE: '1' },
}

export const test = base.extend<AppFixtures>({
  // eslint-disable-next-line no-empty-pattern
  appLaunchOptions: [({}, use) => use(defaultAppLaunchOptions), { option: true }],
  electronApp: async ({ appLaunchOptions }, use) => {
    const app = await launchApp(appLaunchOptions)
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
