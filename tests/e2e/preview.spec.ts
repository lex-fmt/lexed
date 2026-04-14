import { test, expect, loc } from './lib'

test.describe('Preview Feature', () => {
  test('opens HTML preview for lex file', async ({ page }) => {
    await page.waitForSelector('[data-testid="editor-pane"]', { timeout: 15000 })

    await expect(loc.fileTree(page)).toBeVisible()

    const lexFile = loc.fileTreeItem(page, 'general.lex').first()
    await lexFile.click()

    const tab = loc.editorTab(page, 'general.lex').first()
    await expect(tab).toBeVisible()

    await expect(loc.previewButton(page)).toBeVisible()
    await loc.previewButton(page).click()

    const previewTab = loc.editorTab(page, 'Preview:')
    await expect(previewTab).toBeVisible({ timeout: 5000 })

    const iframe = page.locator('iframe[title="Preview"]')
    await expect(iframe).toBeVisible({ timeout: 5000 })

    await expect(previewTab).toContainText('Preview: general.lex')
  })

  test('preview button enables only for lex files', async ({ electronApp, page }) => {
    const getPreviewMenuEnabled = () =>
      electronApp.evaluate(({ Menu }) => {
        const item = Menu.getApplicationMenu()?.getMenuItemById('menu-preview')
        return Boolean(item?.enabled)
      })

    await page.waitForSelector('[data-testid="editor-pane"]', { timeout: 15000 })
    await expect(loc.fileTree(page)).toBeVisible()

    const mdFile = loc.fileTreeItem(page, '.md').first()
    const mdFileExists = (await mdFile.count()) > 0

    if (mdFileExists) {
      await mdFile.click()
      await expect(loc.previewButton(page)).toBeVisible()
      await expect(loc.previewButton(page)).toBeDisabled()
      expect(await getPreviewMenuEnabled()).toBe(false)
    }

    const lexFile = loc.fileTreeItem(page, '.lex').first()
    await lexFile.click()

    await expect(loc.previewButton(page)).toBeVisible()
    await expect(loc.previewButton(page)).toBeEnabled()
    expect(await getPreviewMenuEnabled()).toBe(true)
  })
})
