import { test, expect, loc } from './lib'
import { openFixture } from './helpers'

test.describe('Benchmark File', () => {
  test('should open benchmark file and display correct content and outline', async ({ page }) => {
    test.setTimeout(60000)

    await openFixture(page, 'benchmark.lex')

    await expect(loc.editor(page)).toContainText('Compromise')
    await expect(loc.editor(page)).toContainText('1.')
    await expect(loc.outlineView(page)).toContainText('1. The Cage of Compromise')
  })
})
