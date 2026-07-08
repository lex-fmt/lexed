import { test, expect, assertNoRuntimeErrors } from './lib'
import { openFixture } from './helpers'
import { focusEditor } from './lib/actions'

// Regression guard for the class of bug where code that runs on
// document open throws or logs an error, but the test suite stays
// green because individual feature tests only assert on their own
// output.
//
// The `page` fixture (see `./lib/app.ts`) installs `pageerror` and
// `console.error` listeners and fails on teardown if any runtime
// error slipped through the allowlist. This spec is a minimal, deliberate
// exercise of that guard: load a fixture, focus the editor, wait for
// post-open async activity (semantic tokens, diagnostics, …), then
// assert the collector is empty. Anything that throws or calls
// `console.error` in renderer code during these steps will surface
// here first, and the corresponding error is printed verbatim in the
// failure message so the cause is obvious.
test.describe('Runtime error sentinel', () => {
  test('opening a .lex document produces no pageerror or console.error', async ({
    page,
    runtimeErrors
  }) => {
    await openFixture(page, 'semantic-basic.lex')
    await focusEditor(page)

    // Poll for the editor + semantic tokens to settle. Anything that
    // was going to throw during mount / LSP attach / first render has
    // had a chance by this point.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = window.__e2e.bridge?.getActiveEditorValue?.() as string | undefined
          return typeof active === 'string' && active.length > 0
        })
      )
      .toBe(true)

    // Allow a further tick so any async error that fires from a
    // promise chain kicked off by `editor.setModel` gets the chance
    // to land before we inspect the collector.
    await page.waitForTimeout(250)

    assertNoRuntimeErrors(runtimeErrors, 'opening a .lex document')
  })
})
