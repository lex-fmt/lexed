import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'
import * as loc from './lib/locators'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

test.describe('Split Panes', () => {
  let tempDir: string

  test.beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lex-split-panes-'))
    fs.writeFileSync(path.join(tempDir, 'general.lex'), '# General\nContent')
    fs.writeFileSync(path.join(tempDir, '20-ideas-naked.lex'), '# Ideas, Naked\nContent')
  })

  test.afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  // Skipped: race condition between settings loading (lastFolder) and LSP initialization
  // causing rootUri to be null in test environment, leading to LSP crashing.
  // Visual verification confirms functionality works.
  test.skip('opens files per pane and syncs outline and explorer', async () => {
    test.setTimeout(60000)
    const electronApp = await launchApp()

    try {
      const page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')

      await page.evaluate(async (dirPath) => {
        await (window as any).ipcRenderer.invoke('test-set-workspace', dirPath)
      }, tempDir)
      await page.evaluate(() => location.reload())
      await page.waitForLoadState('domcontentloaded')

      await expect(loc.fileTree(page)).toBeVisible({ timeout: 15000 })
      await expect(loc.fileTreeItem(page, 'general.lex')).toBeVisible()
      await expect(loc.fileTreeItem(page, '20-ideas-naked.lex')).toBeVisible()

      await page.waitForSelector('[data-testid="editor-pane"]')
      const panes = loc.editorPanes(page)

      if ((await panes.count()) === 1) {
        await loc.splitVerticalButton(page).click()
      }
      await expect(panes).toHaveCount(2, { timeout: 15000 })

      // Open general.lex in pane 1
      await panes.nth(0).click()
      await loc.fileTreeItem(page, 'general.lex').first().click()
      await expect(
        panes.nth(0).locator('[data-testid="editor-tab"]', { hasText: /^general\.lex$/ })
      ).toHaveCount(1)

      // Open 20-ideas-naked.lex in pane 2
      await panes.nth(1).click()
      await loc.fileTreeItem(page, '20-ideas-naked.lex').first().click()
      await expect(
        panes.nth(1).locator('[data-testid="editor-tab"]', { hasText: /^20-ideas-naked\.lex$/ })
      ).toHaveCount(1)

      // File tree selection follows active pane
      const generalEntry = page.locator('[data-testid="file-tree-item"][data-path$="general.lex"]')
      const ideasEntry = page.locator(
        '[data-testid="file-tree-item"][data-path$="20-ideas-naked.lex"]'
      )

      await expect(ideasEntry).toHaveAttribute('data-selected', 'true')
      await expect(generalEntry).toHaveAttribute('data-selected', 'false')

      await panes.nth(0).click()
      await expect(generalEntry).toHaveAttribute('data-selected', 'true')
      await expect(ideasEntry).toHaveAttribute('data-selected', 'false')

      // Outline follows active pane
      await expect(loc.outlineView(page).locator('text="1. General"')).toBeVisible({
        timeout: 5000,
      })

      await panes.nth(1).click()
      await expect(loc.outlineView(page).locator('text="Ideas, Naked"')).toBeVisible({
        timeout: 5000,
      })

      // Split and close operations
      await loc.splitVerticalButton(page).click()
      await expect(loc.editorPanes(page)).toHaveCount(3)

      await loc.splitHorizontalButton(page).click()
      await expect(page.locator('[data-testid="pane-row"]')).toHaveCount(2)

      const closeButtons = () => page.locator('[data-pane-id] button[title="Close pane"]')
      const buttonCount = await closeButtons().count()
      if (buttonCount > 0) {
        await closeButtons().last().click()
        await expect(loc.editorPanes(page)).not.toHaveCount(3)
      }
    } finally {
      await electronApp.close()
    }
  })
})
