import { test, expect } from './lib'
import { openFixture } from './helpers'
import { focusEditor } from './lib/actions'

// These tests exercise the three LSP providers lexed now registers in
// `src/lsp/client.ts::registerProviders` by driving the LSP through the
// test bridge. Monaco's provider registries aren't easily introspected
// from tests, so we verify the round-trip path via direct LSP requests
// and confirm each provider returns data for the same fixture the UI
// would see. Together with the providers being imported at app start
// (which ensures registration actually runs) this covers the wiring.

test.describe('LSP providers', () => {
  test('foldingRange responds for a document with sessions and tables', async ({ page }) => {
    await openFixture(page, 'table-sample.lex')
    await focusEditor(page)

    const ranges = (await page.evaluate(() =>
      (window as any).lexTest.requestFoldingRanges()
    )) as Array<{ startLine: number; endLine: number }> | null

    expect(ranges).not.toBeNull()
    expect(Array.isArray(ranges)).toBe(true)
    expect(ranges!.length).toBeGreaterThan(0)
  })

  test('documentLink responds for a document with URLs', async ({ page }) => {
    await openFixture(page, 'table-sample.lex')
    await focusEditor(page)

    const links = (await page.evaluate(() =>
      (window as any).lexTest.requestDocumentLinks()
    )) as Array<{ range: unknown; target?: string }> | null

    expect(links).not.toBeNull()
    expect(Array.isArray(links)).toBe(true)
    // The fixture contains one URL: https://example.com — one link.
    expect(links!.length).toBeGreaterThan(0)
  })

  test('references responds when invoked in the document', async ({ page }) => {
    await openFixture(page, 'table-sample.lex')
    await focusEditor(page)

    // The LSP may legitimately return `null` when the position is not a
    // reference target (nothing to find). The point of this test is to
    // prove the provider is registered and the round-trip completes
    // without throwing — `null` or an array are both acceptable.
    let errorMessage: string | null = null
    const refs = (await page
      .evaluate(() => (window as any).lexTest.requestReferences(1, 1))
      .catch((err: Error) => {
        errorMessage = err.message
        return 'threw'
      })) as Array<{ uri: string; range: unknown }> | null | 'threw'

    expect(errorMessage, 'references request should not throw').toBeNull()
    expect(refs, 'expected null or array, not a thrown error').not.toBe('threw')
    if (refs !== null && refs !== 'threw') {
      expect(Array.isArray(refs)).toBe(true)
    }
  })
})
