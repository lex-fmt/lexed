import { test, expect } from './lib'
import { openFixture } from './helpers'
import { focusEditor } from './lib/actions'

test.describe('Table cell navigation', () => {
  test('Tab / Shift+Tab jumps between pipe cells', async ({ page }) => {
    await openFixture(page, 'table-sample.lex')
    await focusEditor(page)

    // The fixture's Alpha row is:
    //     "        | Alpha | 100   |"
    //      col 1234567890 1234 5 678 …
    // Monaco columns are 1-indexed; pipes are at 9, 17, 25. Cell content
    // starts at pipe+2 (11 and 19). Line 5 is the Alpha row (1: "Table
    // Sample", 2: "", 3: "    Results:", 4: "        | Name ...", 5: Alpha).
    await page.evaluate(() => (window as any).lexTest.setCursor(5, 11))

    // Tab inside the first cell → second cell's content column.
    await page.keyboard.press('Tab')
    const afterNext = await page.evaluate(() => (window as any).lexTest.getCursor())
    expect(afterNext).toEqual({ line: 5, column: 19 })

    // Shift+Tab back to the first cell.
    await page.keyboard.press('Shift+Tab')
    const afterPrev = await page.evaluate(() => (window as any).lexTest.getCursor())
    expect(afterPrev).toEqual({ line: 5, column: 11 })
  })

  test('Tab on a non-pipe line falls through to default indent', async ({ page }) => {
    await openFixture(page, 'table-sample.lex')
    await focusEditor(page)

    // Line 1 is the document title — not a pipe row. Default Tab should
    // insert whitespace.
    await page.evaluate(() => (window as any).lexTest.setCursor(1, 1))

    const before = await page.evaluate(() => (window as any).lexTest.getLineContent(1) as string)

    await page.keyboard.press('Tab')

    const after = await page.evaluate(() => (window as any).lexTest.getLineContent(1) as string)

    expect(after).not.toBe(before)
    expect(after.length).toBeGreaterThan(before.length)
  })
})
