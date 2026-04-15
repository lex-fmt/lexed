import { test, expect, loc, expectToast } from './lib'
import { openFixture } from './helpers'
import * as fs from 'fs/promises'

test.describe('Interop Features', () => {
  test('should convert markdown to lex via convert button', async ({ page }) => {
    const fixture = await openFixture(page, 'sample.md')

    await expect(loc.convertToLexButton(page)).toBeVisible()
    await expect(loc.convertToLexButton(page)).toBeEnabled()
    await loc.convertToLexButton(page).click()

    await expectToast(page, 'Converted')

    const outputPath = fixture.path.replace(/\.md$/, '.lex')
    const outputExists = await fs
      .access(outputPath)
      .then(() => true)
      .catch(() => false)
    expect(outputExists).toBe(true)

    const content = await fs.readFile(outputPath, 'utf-8')
    expect(content).toContain('Sample Markdown')

    await fs.unlink(outputPath).catch(() => {})
  })

  test('should export lex to markdown via menu', async ({ electronApp, page }) => {
    const fixture = await openFixture(page, 'format-basic.lex')

    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.send('menu-export', 'markdown')
    })

    await expectToast(page, 'Exported')

    const outputPath = fixture.path.replace(/\.lex$/, '.md')
    const outputExists = await fs
      .access(outputPath)
      .then(() => true)
      .catch(() => false)
    expect(outputExists).toBe(true)

    const content = await fs.readFile(outputPath, 'utf-8')
    expect(content.length).toBeGreaterThan(0)

    await fs.unlink(outputPath).catch(() => {})
  })

  test('should export lex to html via menu', async ({ electronApp, page }) => {
    const fixture = await openFixture(page, 'format-basic.lex')

    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.send('menu-export', 'html')
    })

    await expectToast(page, 'Exported')

    const outputPath = fixture.path.replace(/\.lex$/, '.html')
    const outputExists = await fs
      .access(outputPath)
      .then(() => true)
      .catch(() => false)
    expect(outputExists).toBe(true)

    const content = await fs.readFile(outputPath, 'utf-8')
    expect(content).toContain('<')

    await fs.unlink(outputPath).catch(() => {})
  })
})
