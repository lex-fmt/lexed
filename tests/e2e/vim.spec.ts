import { test, expect, _electron as electron } from '@playwright/test'
import { launchApp, openFixture } from './helpers'

test.describe('Vim Mode', () => {
  test('should enable vim mode and show status bar', async () => {
    test.setTimeout(60000)
    const electronApp = await electron.launch({
      args: ['.', '--user-data-dir=/tmp/lex-test-vim-' + Date.now()],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        LEX_DISABLE_PERSISTENCE: '0',
      },
    })

    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Wait for Welcome View to ensure app is interactive
    // The welcome view shows "Lex" as header
    await expect(page.locator('text=Simple. Fast. Markdown.').first()).toBeVisible()

    // Open a file to ensure Editor is active (and status bar visible)
    // Use fixture to avoid native save dialogs
    await openFixture(page, 'spellcheck-test.lex')

    // Wait for editor to be visible
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 10000 })

    // Open settings
    await page.click('button[title="Settings"]')
    await expect(page.locator('h2:has-text("Settings")')).toBeVisible()

    // Enable Vim Mode
    const vimModeCheckbox = page.locator('input#vim-mode')
    await vimModeCheckbox.check()

    // Save
    await page.click('text=Save Changes')
    await expect(page.locator('h2:has-text("Settings")')).toBeHidden()

    // Verify settings via IPC
    const settings = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (window as any).ipcRenderer.getAppSettings()
    })
    console.log('Settings after save:', JSON.stringify(settings, null, 2))
    expect(settings.editor.vimMode).toBe(true)

    // Verify status bar is visible
    const statusBar = page.locator('[data-testid="vim-status"]').first()
    await expect(statusBar).toBeVisible()

    // In Normal mode by default
    // monaco-vim status bar usually shows "-- NORMAL --" or similar
    await expect(statusBar).toContainText('NORMAL')

    // Interaction tests are flaky in E2E due to focus issues with monaco-vim
    // We verify activation by checking the status bar presence and initial state.

    await electronApp.close()
  })

  test('should toggle vim mode from status bar widget', async () => {
    test.setTimeout(60000)
    const electronApp = await launchApp()
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    try {
      await page.evaluate(async () => {
        const settings = await (window as any).ipcRenderer.getAppSettings()
        await (window as any).ipcRenderer.setEditorSettings({ ...settings.editor, vimMode: false })
      })

      await openFixture(page, 'spellcheck-test.lex')

      const editor = page.locator('.monaco-editor').first()
      await expect(editor).toBeVisible({ timeout: 20000 })

      const vimButton = page.getByTestId('status-vim-button').first()
      await expect(vimButton).toBeVisible()
      await expect(vimButton).toContainText('Vim: Off')

      await vimButton.click()
      await expect(vimButton).toContainText('Vim: On')

      await expect
        .poll(async () => {
          const settings = await page.evaluate(() => (window as any).ipcRenderer.getAppSettings())
          return settings.editor.vimMode
        })
        .toBe(true)

      await vimButton.click()
      await expect(vimButton).toContainText('Vim: Off')

      await expect
        .poll(async () => {
          const settings = await page.evaluate(() => (window as any).ipcRenderer.getAppSettings())
          return settings.editor.vimMode
        })
        .toBe(false)
    } finally {
      await electronApp.close()
    }
  })
})
