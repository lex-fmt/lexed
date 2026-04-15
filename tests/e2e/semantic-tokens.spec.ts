import { test, expect } from './lib'
import { openFixture } from './helpers'

test.describe('Semantic Tokens', () => {
  test('should request and apply semantic tokens from LSP', async ({ page }) => {
    test.setTimeout(60000)

    await openFixture(page, 'semantic-basic.lex')

    await expect
      .poll(() => page.evaluate(() => (window as any).__lexSemanticTokenCount ?? 0), {
        timeout: 15000,
        message: 'Waiting for semantic tokens from LSP',
      })
      .toBeGreaterThan(0)
  })
})
