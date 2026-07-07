import { test, expect, loc, openWorkspace } from './lib'

test.describe('Split Panes', () => {
  test('opens files per pane and syncs outline and explorer', async ({ page }) => {
    test.setTimeout(60000)

    const workspace = await openWorkspace(page, [
      { relativePath: 'general.lex', content: '# General\nContent' },
      { relativePath: '20-ideas-naked.lex', content: '# Ideas, Naked\nContent' }
    ])

    try {
      await expect(loc.fileTreeItem(page, 'general.lex')).toBeVisible()
      await expect(loc.fileTreeItem(page, '20-ideas-naked.lex')).toBeVisible()

      await page.waitForSelector('[data-testid="editor-pane"]')
      const panes = loc.editorPanes(page)

      if ((await panes.count()) === 1) {
        await loc.splitVerticalButton(page).click()
      }
      await expect(panes).toHaveCount(2, { timeout: 15000 })

      // Open general.lex in pane 1
      await panes.nth(0).click()
      await loc.fileTreeItem(page, 'general.lex').first().click()
      await expect(
        panes.nth(0).locator('[data-testid="editor-tab"]', { hasText: /^general\.lex$/ })
      ).toHaveCount(1)

      // Open 20-ideas-naked.lex in pane 2
      await panes.nth(1).click()
      await loc.fileTreeItem(page, '20-ideas-naked.lex').first().click()
      await expect(
        panes.nth(1).locator('[data-testid="editor-tab"]', { hasText: /^20-ideas-naked\.lex$/ })
      ).toHaveCount(1)

      // File tree selection follows active pane
      const generalEntry = page.locator('[data-testid="file-tree-item"][data-path$="general.lex"]')
      const ideasEntry = page.locator(
        '[data-testid="file-tree-item"][data-path$="20-ideas-naked.lex"]'
      )

      await expect(ideasEntry).toHaveAttribute('data-selected', 'true')
      await expect(generalEntry).toHaveAttribute('data-selected', 'false')

      await panes.nth(0).click()
      await expect(generalEntry).toHaveAttribute('data-selected', 'true')
      await expect(ideasEntry).toHaveAttribute('data-selected', 'false')

      // Outline follows active pane
      await expect(loc.outlineView(page)).toContainText('General', { timeout: 15000 })

      await panes.nth(1).click()
      await expect(loc.outlineView(page)).toContainText('Ideas, Naked', { timeout: 15000 })

      // Split operations
      await loc.splitVerticalButton(page).click()
      await expect(loc.editorPanes(page)).toHaveCount(3)

      await loc.splitHorizontalButton(page).click()
      await expect(page.locator('[data-testid="pane-row"]')).toHaveCount(2)
    } finally {
      workspace.cleanup()
    }
  })
})
