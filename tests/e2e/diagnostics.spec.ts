import { test, expect, loc, expectMarkers } from './lib'
import { openFixture } from './helpers'

test.describe('Diagnostics', () => {
  test('should show mock diagnostics', async ({ page }) => {
    await openFixture(page, 'diagnostics.lex')

    await page.evaluate(() => window.__e2e.bridge?.triggerMockDiagnostics())

    await expect(loc.squigglyError(page)).toBeVisible()
    await expectMarkers(page, [{ message: 'Mock diagnostic for testing', source: 'lex-test' }])
  })
})
