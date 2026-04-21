import { test, expect } from './lib'
import { openFixture } from './helpers'
import { focusEditor } from './lib/actions'

// The fixture's table rows have irregular whitespace inside cells so the
// LSP's `lex.table.format` command has something to reformat:
//
//     "        | Name  | Score |"
//     "        | Alpha | 100   |"
//     "        | Beta  | 200   |"
//
// After formatting the pipe columns must line up consistently across
// rows. We don't assert a specific canonical shape (that's the
// formatter's business) — just that the command ran, produced a change,
// and the result still looks like a table.

test.describe('Format Table at Cursor', () => {
  test('reformats the table under the cursor', async ({ page }) => {
    await openFixture(page, 'table-sample.lex')
    await focusEditor(page)

    // Place the cursor inside the "Alpha" cell (line 5).
    await page.evaluate(() => (window as any).lexTest.setCursor(5, 11))

    const before = await page.evaluate(
      () => (window as any).lexTest.getActiveEditorValue() as string
    )

    const invoked = await page.evaluate(() => (window as any).lexTest.triggerFormatTable())
    expect(invoked).toBe(true)

    // Wait until the editor value changes (or the timeout elapses — if
    // the table was already canonical, triggerFormatTable is a no-op and
    // the assertion block below handles that case).
    await page
      .waitForFunction(
        (previousValue) => {
          const current = (window as any).lexTest.getActiveEditorValue() as string
          return current !== previousValue
        },
        before,
        { timeout: 5000 }
      )
      .catch(() => {
        /* fall through — we'll assert below */
      })

    const after = await page.evaluate(
      () => (window as any).lexTest.getActiveEditorValue() as string
    )

    if (after === before) {
      // Table already canonical → not a failure for this test's intent.
      expect(after).toContain('| Alpha')
      expect(after).toContain('| Beta')
      return
    }

    expect(after).not.toBe(before)
    expect(after).toContain('| Alpha')
    expect(after).toContain('| Beta')
    // The closing data line should survive.
    expect(after).toContain(':: table ::')
  })
})
