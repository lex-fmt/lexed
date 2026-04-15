import { test, expect, loc, resetSettings, focusEditor, openSettings, closeSettings } from './lib'
import { openFixture } from './helpers'

test.describe('Vim Mode', () => {
  test('should enable vim mode via settings dialog and show status bar', async ({ page }) => {
    test.setTimeout(60000)

    await resetSettings(page, { editor: { vimMode: false } })

    await openFixture(page, 'spellcheck-test.lex')

    await openSettings(page)
    await page.locator('input#vim-mode').check()
    await closeSettings(page)

    const settings = await page.evaluate(async () => {
      return await (window as any).ipcRenderer.getAppSettings()
    })
    expect(settings.editor.vimMode).toBe(true)

    // Focus the editor so the vim adapter initializes
    await focusEditor(page)

    const statusBar = page.locator('[data-testid="vim-status"]').first()
    await expect(statusBar).toContainText('NORMAL', { timeout: 15000 })
  })

  test('should toggle vim mode from status bar widget', async ({ page }) => {
    test.setTimeout(60000)

    await resetSettings(page, { editor: { vimMode: false } })

    await openFixture(page, 'spellcheck-test.lex')

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
