import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchApp } from './helpers'

/**
 * These tests exercise the groundwork for OS-level file opens:
 *   1. Per-window workspace root persistence (regression against the old
 *      `set-last-folder` bug that silently dropped writes for new windows).
 *   2. The `recentRoots` history written to the store on folder changes.
 *   3. The main-process router that decides where an OS-opened file lands
 *      (invoked via a test-only IPC that mirrors the macOS `open-file`
 *      event and the Windows/Linux `second-instance` argv path).
 *
 * Each test uses its own `--user-data-dir` so electron-store writes never
 * leak into the user's real settings. `E2E_DISABLE_PERSISTENCE=0` is
 * required: the default fixture forces it to `1`, which short-circuits the
 * very persistence we're trying to verify here.
 */

type LaunchHandle = {
  app: ElectronApplication
  page: Page
}

async function launchReady(userData: string): Promise<LaunchHandle> {
  const app = await launchApp({
    env: { E2E_DISABLE_PERSISTENCE: '0' },
    extraArgs: [`--user-data-dir=${userData}`],
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => window.__e2e?.ready?.app === true, null, {
    timeout: 15000,
  })
  return { app, page }
}

async function setWorkspace(page: Page, folderPath: string): Promise<void> {
  await page.evaluate(async (dir) => {
    await window.__e2e.bridge!.openFolder!(dir)
  }, folderPath)
  // Give the setLastFolder IPC round-trip a tick to complete.
  await page.waitForFunction(
    (expected) => (window as Window).__lexWorkspaceRoot === expected,
    folderPath,
    { timeout: 5000 }
  )
}

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function rmrf(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

test.describe('File routing & workspace persistence', () => {
  let userData: string

  test.beforeEach(() => {
    userData = mkTmp('lexed-userdata-')
  })

  test.afterEach(() => {
    rmrf(userData)
  })

  test('persists the window workspace root across relaunches', async () => {
    const workspace = mkTmp('lexed-ws-')
    try {
      fs.writeFileSync(path.join(workspace, 'hello.lex'), 'hello')

      // Launch 1 — set a root.
      {
        const { app, page } = await launchReady(userData)
        await setWorkspace(page, workspace)
        const settings = await page.evaluate(() => window.ipcRenderer.getAppSettings())
        const entry = settings.openWindows?.[0]
        expect(entry?.lastFolder).toBe(workspace)
        await app.close()
      }

      // Launch 2 — expect the same root to come back.
      {
        const { app, page } = await launchReady(userData)
        const restoredRoot = await page.waitForFunction(
          () => (window as Window).__lexWorkspaceRoot,
          null,
          { timeout: 5000 }
        )
        expect(await restoredRoot.jsonValue()).toBe(workspace)
        await app.close()
      }
    } finally {
      rmrf(workspace)
    }
  })

  test('records every workspace change in recentRoots (most recent first)', async () => {
    const workspaceA = mkTmp('lexed-wsA-')
    const workspaceB = mkTmp('lexed-wsB-')
    try {
      const { app, page } = await launchReady(userData)
      await setWorkspace(page, workspaceA)
      await setWorkspace(page, workspaceB)

      const settings = await page.evaluate(() => window.ipcRenderer.getAppSettings())
      const paths: string[] = (settings.recentRoots ?? []).map((r: { path: string }) => r.path)
      expect(paths).toContain(workspaceA)
      expect(paths).toContain(workspaceB)
      expect(paths[0]).toBe(workspaceB)

      await app.close()
    } finally {
      rmrf(workspaceA)
      rmrf(workspaceB)
    }
  })

  test('OS-opens a file under the current workspace root into the same window', async () => {
    const workspace = mkTmp('lexed-ws-')
    try {
      const filePath = path.join(workspace, 'a.lex')
      fs.writeFileSync(filePath, 'content')

      const { app, page } = await launchReady(userData)
      await setWorkspace(page, workspace)

      const result = await page.evaluate(async (fp) => {
        return window.ipcRenderer.testRouteOpenFiles([fp])
      }, filePath)

      expect(result).toHaveLength(1)
      expect(result[0].kind).toBe('existingWindow')
      expect(result[0].filePath).toBe(filePath)

      // Locator by testid + basename text — portable across platforms where
      // the absolute path may contain backslashes or get normalized.
      await expect(
        page.locator('[data-testid="editor-tab"]').filter({ hasText: path.basename(filePath) })
      ).toBeVisible({ timeout: 5000 })

      await app.close()
    } finally {
      rmrf(workspace)
    }
  })

  test('OS-opens a file under a recent (non-current) root in a new window with that root', async () => {
    const workspaceA = mkTmp('lexed-wsA-')
    const workspaceB = mkTmp('lexed-wsB-')
    try {
      const fileInA = path.join(workspaceA, 'a.lex')
      fs.writeFileSync(fileInA, 'content')

      const { app, page } = await launchReady(userData)
      await setWorkspace(page, workspaceA)
      await setWorkspace(page, workspaceB)
      // Current window's root is now B; A is in recentRoots but not open.

      const newWindowPromise = app.waitForEvent('window')
      const result = await page.evaluate(async (fp) => {
        return window.ipcRenderer.testRouteOpenFiles([fp])
      }, fileInA)

      expect(result).toHaveLength(1)
      expect(result[0].kind).toBe('newWindowWithRoot')
      expect(result[0].root).toBe(workspaceA)

      const newPage = await newWindowPromise
      await newPage.waitForLoadState('domcontentloaded')
      await newPage.waitForFunction(() => window.__e2e?.ready?.app === true, null, {
        timeout: 15000,
      })
      await newPage.waitForFunction(
        (expected) => (window as Window).__lexWorkspaceRoot === expected,
        workspaceA,
        { timeout: 5000 }
      )

      await expect(
        newPage.locator('[data-testid="editor-tab"]').filter({ hasText: path.basename(fileInA) })
      ).toBeVisible({ timeout: 10000 })

      await app.close()
    } finally {
      rmrf(workspaceA)
      rmrf(workspaceB)
    }
  })
})
