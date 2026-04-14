import { test, expect, loc, waitForEditor, expectMarkers } from './lib'

test.describe('Diagnostics', () => {
  test('should show mock diagnostics', async ({ page }) => {
    const { openFixture } = await import('./helpers')
    await openFixture(page, 'diagnostics.lex')

    await waitForEditor(page)

    await page.evaluate(() => window.lexTest?.triggerMockDiagnostics())

    await expect(loc.squigglyError(page)).toBeVisible()
    await expectMarkers(page, [{ message: 'Mock diagnostic for testing', source: 'lex-test' }])
  })
})
