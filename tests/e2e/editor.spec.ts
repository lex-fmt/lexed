import { test, focusEditor, expectEditorValue } from './lib'
import { openFixture } from './helpers'

test.describe('Editor', () => {
  test('should load editor and apply syntax highlighting', async ({ page }) => {
    await openFixture(page, 'empty.lex')

    await focusEditor(page)

    await page.evaluate(() => {
      window.__e2e.bridge?.setActiveEditorValue?.('# Hello World\nThis is a *test*.')
    })

    await expectEditorValue(page, '# Hello World')
    await expectEditorValue(page, 'This is a *test*.')
  })
})
