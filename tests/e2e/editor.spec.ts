import { test, loc, waitForEditor, expectEditorValue } from './lib'
import { openFixture } from './helpers'

test.describe('Editor', () => {
  test('should load editor and apply syntax highlighting', async ({ page }) => {
    await openFixture(page, 'empty.lex')

    await waitForEditor(page)

    await loc.editor(page).click()
    await page.evaluate(() => {
      window.lexTest?.editor?.focus()
    })

    await page.evaluate(() => {
      window.lexTest?.setActiveEditorValue?.('# Hello World\nThis is a *test*.')
    })

    await expectEditorValue(page, '# Hello World')
    await expectEditorValue(page, 'This is a *test*.')
  })
})
