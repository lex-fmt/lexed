import {
  test,
  loc,
  focusEditor,
  expectNoCompletionItem,
  expectCompletionItem,
  openWorkspace
} from './lib'
import { openFixture } from './helpers'
import path from 'node:path'

test.describe('Path completion', () => {
  test('does not trigger suggestions without @ prefix', async ({ page }) => {
    await openFixture(page, 'empty.lex')

    await focusEditor(page)
    await page.keyboard.type('a')
    await page.evaluate(() => window.__e2e.bridge.triggerSuggest())

    await expectNoCompletionItem(page, { detail: 'path reference' })
  })

  test('inserts relative paths for workspace files', async ({ page }) => {
    test.setTimeout(90000)

    const workspace = await openWorkspace(page, [
      { relativePath: 'notes/entry.lex', content: '# Entry File\n\nThis is a test document.\n' },
      { relativePath: 'assets/image.png', content: 'fake-image' },
      { relativePath: '.gitignore', content: '' }
    ])

    try {
      // Open entry.lex via file tree
      await loc
        .fileTreeItem(page, /^notes$/)
        .first()
        .click()
      await loc
        .fileTreeItem(page, /^entry\.lex$/)
        .first()
        .click()

      // Compute expected relative path
      const expectedRelative =
        (await page.evaluate(
          ({ modelDir }) => {
            return (window as any).__lexPathTestHelpers?.computeRelativeInsertText(
              'assets/image.png',
              'assets/image.png',
              modelDir,
              (window as any).__lexWorkspaceRoot ?? undefined
            )
          },
          { modelDir: path.join(workspace.path, 'notes') }
        )) ?? '../assets/image.png'

      // Wait for editor to be ready with the file
      await focusEditor(page)

      // Type @ trigger and verify path completion appears
      await page.keyboard.type('@ima')
      await page.evaluate(() => window.__e2e.bridge.triggerSuggest())

      await expectCompletionItem(page, { insertText: expectedRelative }, { timeout: 20000 })
    } finally {
      workspace.cleanup()
    }
  })
})
