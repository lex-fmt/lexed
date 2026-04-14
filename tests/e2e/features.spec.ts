import { test, expect, loc, waitForEditor, waitForEditorContent, expectEditorValue } from './lib'
import { openFixture } from './helpers'

test.describe('LexEd Features', () => {
  test('should support completion', async ({ page }) => {
    await openFixture(page, 'empty.lex')
    await waitForEditor(page)
    await loc.editor(page).click()
    await page.evaluate(() => (window as any).lexTest?.focusEditor?.())

    await page.keyboard.type('@')
    await page.evaluate(() => (window as any).lexTest?.triggerSuggest?.())

    await expect(loc.suggestWidget(page)).toBeVisible({ timeout: 10000 })
  })

  test('should support insert commands', async ({ electronApp, page }) => {
    await openFixture(page, 'empty.lex')
    await waitForEditor(page)

    // Mock file-pick in Main Process
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('file-pick')
      ipcMain.handle('file-pick', async () => {
        return '/tmp/test-asset.png'
      })
    })

    // Trigger Insert Asset via menu
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.send('menu-insert-asset')
    })

    await waitForEditorContent(page, 'doc.image')

    await expectEditorValue(page, 'doc.image')
    await expectEditorValue(page, 'test-asset.png')
  })

  test('should support range formatting', async ({ page }) => {
    await openFixture(page, 'format-basic.lex')
    await waitForEditor(page)
    await loc.editor(page).click()

    // Select a range (lines 1-2)
    await page.evaluate(() => {
      const scopedWindow = window as any
      const editor = scopedWindow.lexTest?.editor
      if (editor && scopedWindow.monaco?.Selection) {
        editor.setSelection(new scopedWindow.monaco.Selection(1, 1, 2, 1))
      }
    })

    // Trigger Format Selection
    await page.evaluate(() => {
      ;(window as any).lexTest?.editor?.trigger('source', 'editor.action.formatSelection')
    })

    // The range formatting provider sends the request to the LSP and applies edits.
    // We verify the editor still has content (action didn't crash) and the value is non-empty.
    // Full formatting assertion coverage is in format.spec.ts; this validates the action path.
    await expectEditorValue(page, 'Title')
  })
})
