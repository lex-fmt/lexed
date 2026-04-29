import { _electron as electron, expect, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'
import type { ProcessEnv } from 'node:process'

export type AppLaunchOptions = {
  extraArgs?: string[]
  env?: Record<string, string | undefined>
}

export async function launchApp(options: AppLaunchOptions = {}) {
  const { extraArgs: userArgs = [], env: envOverrides = {} } = options

  // Electron's SUID sandbox doesn't work in CI containers; disable it on Linux CI
  const ciArgs = process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []
  const extraArgs = [...ciArgs, ...userArgs]
  const useBuiltRenderer = process.env.E2E_USE_BUILD === '1'
  const devServerUrl =
    process.env.VITE_DEV_SERVER_URL || (useBuiltRenderer ? undefined : 'http://localhost:5173')

  // Isolate user-data per launch so tests don't read (or write) the
  // developer's real persisted settings — without isolation the
  // spellcheck language bleeds in and can blow test timeouts for large
  // Hunspell locales (e.g. pt_BR at 4+ MB). Callers that need
  // cross-launch persistence (e.g. file-routing) can provide their own
  // via envOverrides.E2E_USER_DATA_DIR or a --user-data-dir extra arg;
  // we only auto-create a fresh dir when neither is set.
  const callerProvidedDir =
    envOverrides.E2E_USER_DATA_DIR ||
    extraArgs.find((a) => a.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length)
  const autoCreatedDir = callerProvidedDir
    ? undefined
    : fs.mkdtempSync(path.join(os.tmpdir(), 'lexed-e2e-'))

  // E2E_USER_DATA_DIR goes *after* the envOverrides spread. Some callers
  // build their env objects conditionally and may end up with
  // `E2E_USER_DATA_DIR: undefined` in the override; if that spread
  // came last it would wipe out our isolation dir and reintroduce the
  // machine-dependent state we're trying to avoid.
  const env: ProcessEnv = {
    ...process.env,
    NODE_ENV: useBuiltRenderer ? 'production' : 'development',
    E2E_DISABLE_SINGLE_INSTANCE_LOCK: '1',
    ...envOverrides,
    E2E_USER_DATA_DIR: callerProvidedDir ?? autoCreatedDir,
  }

  if (!env.E2E_HIDE_WINDOW) {
    env.E2E_HIDE_WINDOW = '1'
  }

  if (devServerUrl) {
    env.VITE_DEV_SERVER_URL = devServerUrl
  } else {
    delete env.VITE_DEV_SERVER_URL
  }

  if (useBuiltRenderer) {
    const binaryName = process.platform === 'win32' ? 'lexd-lsp.exe' : 'lexd-lsp'
    env.LEX_LSP_PATH = path.join(process.cwd(), 'resources', binaryName)
  }

  const app = await electron.launch({
    args: ['.', ...extraArgs],
    env,
  })
  app.process().stdout?.on('data', (data) => console.log(`Electron stdout: ${data}`))
  app.process().stderr?.on('data', (data) => console.log(`Electron stderr: ${data}`))
  // Clean up only the dir we auto-created (caller-owned dirs are the
  // caller's responsibility).
  if (autoCreatedDir) {
    app.once('close', () => {
      fs.rm(autoCreatedDir, { recursive: true, force: true }, () => {})
    })
  }
  return app
}

/**
 * Open a test fixture file and wait for the editor to be visible.
 * Prerequisite: page fixture guarantees the e2e bridge and LSP are ready.
 * For pages not created by the fixture (e.g. packaged.spec.ts),
 * call waitForApp(page) first.
 */
export async function openFixture(page: Page, fixtureName: string) {
  const result = await page.evaluate(async (name) => {
    const openFixtureFn = window.__e2e.bridge.openFixture
    if (!openFixtureFn) {
      throw new Error('e2e bridge openFixture not available')
    }
    return openFixtureFn(name) as Promise<{ path: string; content: string }>
  }, fixtureName)

  // Guarantee editor is visible before returning to the test
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15000 })

  return result
}
