import { test, expect, loc } from './lib'
import { openFixture } from './helpers'

test.describe('Benchmark File', () => {
  test('should open benchmark file and display correct content and outline', async ({ page }) => {
    test.setTimeout(60000)

    await openFixture(page, 'benchmark.lex')

    const editor = loc.editor(page)
    await expect(editor).toBeVisible()

    await expect(editor).toContainText('Compromise')
    await expect(editor).toContainText('1.')

    await expect(loc.outlineView(page)).toContainText('1. The Cage of Compromise')
  })
})
