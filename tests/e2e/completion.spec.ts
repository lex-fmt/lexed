import { test, expect, loc, waitForEditor } from './lib'
import { openFixture } from './helpers'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const createWorkspace = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lexed-path-workspace-'))
  const notesDir = path.join(root, 'notes')
  const assetsDir = path.join(root, 'assets')
  fs.mkdirSync(notesDir, { recursive: true })
  fs.mkdirSync(assetsDir, { recursive: true })
  fs.writeFileSync(
    path.join(notesDir, 'entry.lex'),
    '# Entry File\n\nThis is a test document.\n\n@ima'
  )
  fs.writeFileSync(path.join(assetsDir, 'image.png'), 'fake-image')
  fs.writeFileSync(path.join(root, '.gitignore'), '')
  return root
}

test.describe('Path completion', () => {
  test('does not trigger suggestions without @ prefix', async ({ page }) => {
    await openFixture(page, 'empty.lex')

    await waitForEditor(page)
    await loc.editor(page).click()
    await page.evaluate(() => (window as any).lexTest?.focusEditor?.())

    await page.keyboard.type('a')
    await page.evaluate(() => (window as any).lexTest?.triggerSuggest?.())

    await expect
      .poll(
        async () => {
          const sample = await page.evaluate(() => (window as any).__lexCompletionSample ?? [])
          return Array.isArray(sample)
            ? sample.find((item: any) => item?.detail === 'path reference')
            : null
        },
        { timeout: 2000 }
      )
      .toBeUndefined()
  })

  // TODO: re-enable once __lexCompletionSample is reliably populated in headless CI
  test.skip('inserts relative paths for workspace files', async ({ page }) => {
    const workspace = createWorkspace()

    try {
      await page.evaluate(async (rootPath) => {
        await (window as any).ipcRenderer.invoke('test-set-workspace', rootPath)
      }, workspace)
      await page.evaluate(() => location.reload())
      await page.waitForLoadState('domcontentloaded')

      await expect(loc.fileTree(page)).toBeVisible({ timeout: 15000 })
      await loc
        .fileTreeItem(page, /^notes$/)
        .first()
        .click()
      await loc
        .fileTreeItem(page, /^entry\.lex$/)
        .first()
        .click()

      const assetPath = path.join(workspace, 'assets', 'image.png')
      const expectedRelative =
        (await page.evaluate(
          ({ modelDir, assetPath: _assetPath }) => {
            return (window as any).__lexPathTestHelpers?.computeRelativeInsertText(
              'assets/image.png',
              'assets/image.png',
              modelDir,
              (window as any).__lexWorkspaceRoot ?? undefined
            )
          },
          {
            modelDir: path.join(workspace, 'notes'),
            assetPath,
          }
        )) ?? '../assets/image.png'

      await waitForEditor(page)
      await loc.editor(page).click()
      await page.evaluate(() => (window as any).lexTest?.focusEditor?.())

      await page.keyboard.type('@ima')
      await page.evaluate(() => (window as any).lexTest?.triggerSuggest?.())
      await expect(loc.suggestWidget(page)).toBeVisible({ timeout: 10000 })
      await expect
        .poll(async () => {
          const sample = await page.evaluate(() => (window as any).__lexCompletionSample ?? [])
          return Array.isArray(sample)
            ? sample.find((item: any) => item?.insertText === expectedRelative)
            : undefined
        })
        .not.toBeUndefined()
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true })
    }
  })
})
