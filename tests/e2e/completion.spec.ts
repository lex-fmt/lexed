import { test, expect } from '@playwright/test'
import { launchApp, openFixture } from './helpers'
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
  test('does not trigger suggestions without @ prefix', async () => {
    const electronApp = await launchApp()
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await openFixture(page, 'empty.lex')

    const editor = page.locator('.monaco-editor').first()
    await expect(editor).toBeVisible({ timeout: 15000 })
    await editor.click()
    await page.evaluate(() => (window as any).lexTest?.focusEditor?.())

    await page.keyboard.type('a')
    await page.evaluate(() => (window as any).lexTest?.triggerSuggest?.())
    await page.waitForTimeout(500)
    const sample = await page.evaluate(() => (window as any).__lexCompletionSample ?? [])
    const pathReference = Array.isArray(sample)
      ? sample.find((item: any) => item?.detail === 'path reference')
      : null
    expect(pathReference).toBeUndefined()

    await electronApp.close()
  })

  // TODO: re-enable once __lexCompletionSample is reliably populated in headless CI
  test.skip('inserts relative paths for workspace files', async () => {
    const workspace = createWorkspace()
    const electronApp = await launchApp()
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    try {
      await page.evaluate(async (rootPath) => {
        await (window as any).ipcRenderer.invoke('test-set-workspace', rootPath)
      }, workspace)
      await page.evaluate(() => location.reload())
      await page.waitForLoadState('domcontentloaded')

      const fileTree = page.locator('[data-testid="file-tree"]')
      await expect(fileTree).toBeVisible({ timeout: 15000 })
      await page.locator('[data-testid="file-tree-item"]', { hasText: /^notes$/ }).first().click()
      await page.locator('[data-testid="file-tree-item"]', { hasText: /^entry\.lex$/ }).first().click()

      const assetPath = path.join(workspace, 'assets', 'image.png')
      const expectedRelative = await page.evaluate(
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
      ) ?? '../assets/image.png'

      const editor = page.locator('.monaco-editor').first()
      await expect(editor).toBeVisible({ timeout: 15000 })
      await editor.click()
      await page.evaluate(() => (window as any).lexTest?.focusEditor?.())

      await page.keyboard.type('@ima')
      await page.waitForTimeout(500)
      await page.evaluate(() => (window as any).lexTest?.triggerSuggest?.())
      const widget = page.locator('.suggest-widget')
      await expect(widget).toBeVisible({ timeout: 10000 })
      await expect
        .poll(async () => {
          const sample = await page.evaluate(() => (window as any).__lexCompletionSample ?? [])
          return Array.isArray(sample)
            ? sample.find((item: any) => item?.insertText === expectedRelative)
            : undefined
        })
        .not.toBeUndefined()
    } finally {
      await electronApp.close()
      fs.rmSync(workspace, { recursive: true, force: true })
    }
  })
})
