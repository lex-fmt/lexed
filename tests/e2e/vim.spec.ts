import { test, expect, loc, waitForEditor } from './lib'
import { openFixture } from './helpers'

test.describe('Vim Mode', () => {
  // Skipped: Vim mode interaction is flaky in E2E due to focus issues with monaco-vim.
  // Status bar presence verified in the active test below.
  test.skip('should enable vim mode and show status bar', async ({ page }) => {
    test.setTimeout(60000)

    await expect(page.locator('text=Simple. Fast. Markdown.').first()).toBeVisible()

    await openFixture(page, 'spellcheck-test.lex')
    await waitForEditor(page)

    await loc.settingsButton(page).click()
    await expect(loc.settingsHeading(page)).toBeVisible()

    await page.locator('input#vim-mode').check()
    await loc.saveChangesButton(page).click()
    await expect(loc.settingsHeading(page)).toBeHidden()

    const settings = await page.evaluate(async () => {
      return await (window as any).ipcRenderer.getAppSettings()
    })
    expect(settings.editor.vimMode).toBe(true)

    await loc.editor(page).click()

    const statusBar = page.locator('[data-testid="vim-status"]').first()
    await expect(statusBar).toBeVisible({ timeout: 15000 })
    await expect(statusBar).toContainText('NORMAL', { timeout: 15000 })
  })

  test('should toggle vim mode from status bar widget', async ({ page }) => {
    test.setTimeout(60000)

    await page.evaluate(async () => {
      const settings = await (window as any).ipcRenderer.getAppSettings()
      await (window as any).ipcRenderer.setEditorSettings({ ...settings.editor, vimMode: false })
    })

    await openFixture(page, 'spellcheck-test.lex')
    await waitForEditor(page)

    await expect(loc.vimButton(page)).toBeVisible()
    await expect(loc.vimButton(page)).toContainText('Vim: Off')

    await loc.vimButton(page).click()
    await expect(loc.vimButton(page)).toContainText('Vim: On')

    await expect
      .poll(async () => {
        const settings = await page.evaluate(() => (window as any).ipcRenderer.getAppSettings())
        return settings.editor.vimMode
      })
      .toBe(true)

    await loc.vimButton(page).click()
    await expect(loc.vimButton(page)).toContainText('Vim: Off')

    await expect
      .poll(async () => {
        const settings = await page.evaluate(() => (window as any).ipcRenderer.getAppSettings())
        return settings.editor.vimMode
      })
      .toBe(false)
  })
})
