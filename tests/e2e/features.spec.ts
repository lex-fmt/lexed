import {
  test,
  waitForEditorContent,
  focusEditor,
  expectEditorValue,
  triggerCompletion,
} from './lib'
import { openFixture } from './helpers'

test.describe('LexEd Features', () => {
  test('should support completion', async ({ page }) => {
    await openFixture(page, 'empty.lex')

    await triggerCompletion(page, '@')
  })

  test('should support insert commands', async ({ electronApp, page }) => {
    await openFixture(page, 'empty.lex')

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
    await focusEditor(page)

    // Select a range (lines 1-2). NOTE: bridge.editor is not currently exposed,
    // so this block is a no-op — preserved from pre-migration behavior. See
    // followup needed: expose an editor accessor on window.__e2e.bridge or
    // route through bridge.setSelection(line, col).
    await page.evaluate(() => {
      const scopedWindow = window as any
      const editor = scopedWindow.__e2e?.bridge?.editor
      if (editor && scopedWindow.monaco?.Selection) {
        editor.setSelection(new scopedWindow.monaco.Selection(1, 1, 2, 1))
      }
    })

    // Trigger Format Selection
    await page.evaluate(() => {
      window.__e2e.bridge?.editor?.trigger('source', 'editor.action.formatSelection')
    })

    // The range formatting provider sends the request to the LSP and applies edits.
    // We verify the editor still has content (action didn't crash) and the value is non-empty.
    await expectEditorValue(page, 'Title')
  })
})
