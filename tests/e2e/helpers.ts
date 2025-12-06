import { _electron as electron, type Page } from '@playwright/test'
import path from 'node:path'
import type { ProcessEnv } from 'node:process'

type LaunchOptions = {
  extraArgs?: string[]
  env?: Record<string, string | undefined>
}

export async function launchApp(options: LaunchOptions = {}) {
  const { extraArgs = [], env: envOverrides = {} } = options
  const useBuiltRenderer = process.env.LEX_E2E_USE_BUILD === '1'
  const devServerUrl =
    process.env.VITE_DEV_SERVER_URL || (useBuiltRenderer ? undefined : 'http://localhost:5173')

  const env: ProcessEnv = {
    ...process.env,
    NODE_ENV: useBuiltRenderer ? 'production' : 'development',
    LEX_DISABLE_SINGLE_INSTANCE_LOCK: '1',
    ...envOverrides,
  }

  if (devServerUrl) {
    env.VITE_DEV_SERVER_URL = devServerUrl
  } else {
    delete env.VITE_DEV_SERVER_URL
  }

  if (useBuiltRenderer) {
    const binaryName = process.platform === 'win32' ? 'lex-lsp.exe' : 'lex-lsp'
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

export async function openFixture(page: Page, fixtureName: string) {
  const waitTimeout = process.env.LEX_E2E_USE_BUILD === '1' ? 15000 : 5000
  await page.waitForFunction(() => Boolean((window as LexTestWindow).lexTest), null, {
    timeout: waitTimeout,
  })
  return await page.evaluate(async (name) => {
    const scopedWindow = window as LexTestWindow
    if (!scopedWindow.lexTest) {
      throw new Error('lexTest helpers not available')
    }
    return scopedWindow.lexTest.openFixture(name)
  }, fixtureName)
}
