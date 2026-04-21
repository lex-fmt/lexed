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

/** A runtime error observed in the renderer during a test. */
export interface CapturedRuntimeError {
  /** Where the error came from: a Playwright `pageerror` or a `console.error`. */
  source: 'pageerror' | 'console'
  /** The error message text. */
  message: string
}

export type AppFixtures = {
  electronApp: ElectronApplication
  page: Page
  appLaunchOptions: AppLaunchOptions
  runtimeErrors: CapturedRuntimeError[]
}

const defaultAppLaunchOptions: AppLaunchOptions = {
  env: { LEX_DISABLE_PERSISTENCE: '1' },
}

/**
 * Messages we know are emitted during normal app startup and are not
 * produced by our own code — matching against substrings. Add sparingly;
 * the goal is to keep the error capture meaningful, not permissive.
 */
const IGNORED_ERROR_PATTERNS: ReadonlyArray<string> = [
  // Chromium/Electron DevTools noise in headless mode.
  'Autofill.enable',
  'Autofill.setAddresses',
  // React DevTools banner when the extension isn't installed.
  'Download the React DevTools',
  // TODO: lex-fmt/lex — `lex-lsp` occasionally emits a semantic token
  //   whose `end` column exceeds the line's length, which Monaco
  //   complains about on certain fixtures (observed with
  //   `preview.spec.ts` → `general.lex`). Ignored here so this
  //   harness PR isn't blocked; track as its own bug with a
  //   minimum-repro document.
  'Invalid Semantic Tokens Data From Extension',
  // TODO: lexed — `LEX_E2E_USE_BUILD=1` (production bundle) path
  //   logs `net::ERR_FILE_NOT_FOUND` in the renderer on startup,
  //   suggesting something in the built index.html references an
  //   asset that doesn't ship. Pre-existing; allowlisted so the
  //   harness lands. Track as its own bug once we've narrowed the
  //   missing resource.
  'Failed to load resource: net::ERR_FILE_NOT_FOUND',
]

function shouldIgnore(message: string): boolean {
  return IGNORED_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
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

    // Guarantee the app is fully mounted and LSP is ready before any test runs.
    // Individual tests should never need to call waitForApp/waitForLsp.
    const timeout = process.env.LEX_E2E_USE_BUILD === '1' ? 15000 : 10000
    await page.waitForFunction(() => Boolean((window as any).lexTest), null, { timeout })
    await page.waitForFunction(() => Boolean((window as any).__lexLspReady), null, { timeout })

    await use(page)
  },
  // Per-test collector for runtime errors. Pageerrors (uncaught
  // exceptions, unhandled rejections) and `console.error` calls both
  // land here, minus anything matched by the allowlist above.
  //
  // Marked `auto: true` so listeners are installed on every test's
  // page whether or not the test body references `runtimeErrors`.
  // Tests that want to inspect the array mid-run can still accept it
  // as a parameter and/or call `assertNoRuntimeErrors` from
  // `./assertions`; tests that don't accept it still benefit from the
  // teardown-time auto-assertion below, which fails any passing test
  // that silently captured runtime errors.
  runtimeErrors: [
    async ({ page }, use, testInfo) => {
      const errors: CapturedRuntimeError[] = []

      const onPageError = (err: Error) => {
        if (shouldIgnore(err.message)) return
        errors.push({ source: 'pageerror', message: err.message })
      }
      const onConsole = (msg: { type(): string; text(): string }) => {
        if (msg.type() !== 'error') return
        const text = msg.text()
        if (shouldIgnore(text)) return
        errors.push({ source: 'console', message: text })
      }

      page.on('pageerror', onPageError)
      page.on('console', onConsole)

      let useError: unknown
      try {
        await use(errors)
      } catch (err) {
        useError = err
      }

      page.off('pageerror', onPageError)
      page.off('console', onConsole)

      if (useError !== undefined) {
        // The test body already failed; surface that as-is so the
        // reported failure points at the real cause rather than a
        // teardown-time assertion.
        throw useError
      }

      // Only auto-fail on errors when the test itself passed. Read
      // the latest status from the testInfo — by this point the test
      // body has completed and Playwright has finalised it.
      if (testInfo.status === testInfo.expectedStatus && errors.length > 0) {
        const lines = errors.map((e, i) => `  [${i + 1}] (${e.source}) ${e.message}`)
        throw new Error(
          `Runtime errors captured during test (${errors.length}):\n${lines.join('\n')}`
        )
      }
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
