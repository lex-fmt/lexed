import { _electron as electron, expect, type Page } from '@playwright/test'
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
  const useBuiltRenderer = process.env.LEX_E2E_USE_BUILD === '1'
  const devServerUrl =
    process.env.VITE_DEV_SERVER_URL || (useBuiltRenderer ? undefined : 'http://localhost:5173')

  const env: ProcessEnv = {
    ...process.env,
    NODE_ENV: useBuiltRenderer ? 'production' : 'development',
    LEX_DISABLE_SINGLE_INSTANCE_LOCK: '1',
    ...envOverrides,
  }

  if (!env.LEX_HIDE_WINDOW) {
    env.LEX_HIDE_WINDOW = '1'
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
  return app
}

type LexTestWindow = Window & {
  lexTest?: {
    openFixture: (fixtureName: string) => Promise<{ path: string; content: string }>
  }
}

/**
 * Open a test fixture file and wait for the editor to be visible.
 * Prerequisite: page fixture guarantees lexTest and LSP are ready.
 * For pages not created by the fixture (e.g. packaged.spec.ts),
 * call waitForApp(page) first.
 */
export async function openFixture(page: Page, fixtureName: string) {
  const result = await page.evaluate(async (name) => {
    const scopedWindow = window as LexTestWindow
    if (!scopedWindow.lexTest) {
      throw new Error('lexTest helpers not available')
    }
    return scopedWindow.lexTest.openFixture(name)
  }, fixtureName)

  // Guarantee editor is visible before returning to the test
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 15000 })

  return result
}
