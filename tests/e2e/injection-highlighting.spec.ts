import { test, expect } from './lib'
import { openFixture } from './helpers'

/**
 * Injection highlighting inside `:: <lang> ::` verbatim blocks.
 *
 * The renderer wires `@lex/monaco-inline-injections` (the host-neutral
 * package extracted from the original vscode port) on top of a Monaco
 * host adapter that feeds back Monaco's built-in Monarch tokenizers. We
 * verify the end-to-end pipeline — tree-sitter parse → zone detection →
 * host-adapter semantic tokens → decoration ranges — by opening a fixture
 * with two annotated blocks and asserting the package produced ranges
 * that fall inside each block. The exact
 * colours are the host's business; we only care that *some* tokens are
 * categorised, and that they live inside the annotated zones (not in
 * the surrounding prose).
 *
 * Two assertions lift the bar beyond "some ranges exist":
 *   1. Every returned range falls within one of the tree-sitter injection
 *      zones (nothing leaks into prose lines).
 *   2. Both the Python and JavaScript zones contribute at least one range,
 *      meaning the alias resolution + per-language tokenizer priming work
 *      for both.
 */

interface InjectionRange {
  startLine: number
  startCol: number
  endLine: number
  endCol: number
}

interface InjectionZone {
  language: string
  startRow: number
  endRow: number
}

test.describe('Injection Highlighting', () => {
  test('produces categorised ranges inside :: python :: and :: javascript :: blocks', async ({
    page,
  }) => {
    test.setTimeout(30_000)

    await openFixture(page, 'injection-sample.lex')

    // Tree-sitter WASM and each Monarch tokenizer load asynchronously;
    // the shared module's debounce window is 250 ms. Poll until we see
    // zones for both languages (tree-sitter ready) and then until at
    // least one range lands (host adapter ready).
    await expect
      .poll(
        async () => {
          const zones = (await page.evaluate(() =>
            (window as any).lexTest?.getInjectionZones?.()
          )) as InjectionZone[] | undefined
          if (!zones) return 0
          const langs = new Set(zones.map((z) => z.language))
          return (langs.has('python') ? 1 : 0) + (langs.has('javascript') ? 1 : 0)
        },
        { timeout: 15_000, message: 'Waiting for tree-sitter to detect both injection zones' }
      )
      .toBe(2)

    // Force a refresh so we don't race against the debounce timer.
    await page.evaluate(() => (window as any).lexTest.refreshInjectionHighlighter())

    await expect
      .poll(
        async () => {
          const ranges = (await page.evaluate(() =>
            (window as any).lexTest?.getInjectionRanges?.()
          )) as InjectionRange[] | undefined
          return ranges?.length ?? 0
        },
        { timeout: 10_000, message: 'Waiting for injection ranges to materialise' }
      )
      .toBeGreaterThan(0)

    const { zones, ranges, byCategory } = await page.evaluate(() => {
      const api = (window as any).lexTest
      return {
        zones: api.getInjectionZones() as InjectionZone[],
        ranges: api.getInjectionRanges() as InjectionRange[],
        byCategory: api.getInjectionRangesByCategory() as Record<string, InjectionRange[]>,
      }
    })

    expect(zones.length).toBeGreaterThanOrEqual(2)
    const pythonZone = zones.find((z) => z.language === 'python')!
    const javascriptZone = zones.find((z) => z.language === 'javascript')!
    expect(pythonZone).toBeDefined()
    expect(javascriptZone).toBeDefined()

    // Every range must fall inside some zone's line span.
    const zoneContains = (r: InjectionRange) =>
      zones.some((z) => r.startLine >= z.startRow && r.endLine <= z.endRow)
    for (const r of ranges) {
      expect(
        zoneContains(r),
        `range ${JSON.stringify(r)} should fall inside an injection zone`
      ).toBe(true)
    }

    // Both zones must contribute at least one range — confirms both the
    // Python and JavaScript tokenizers wired through the host adapter.
    const pythonRanges = ranges.filter(
      (r) => r.startLine >= pythonZone.startRow && r.endLine <= pythonZone.endRow
    )
    const javascriptRanges = ranges.filter(
      (r) => r.startLine >= javascriptZone.startRow && r.endLine <= javascriptZone.endRow
    )
    expect(pythonRanges.length).toBeGreaterThan(0)
    expect(javascriptRanges.length).toBeGreaterThan(0)

    // Categorised output: at least two distinct categories should fire
    // across the two blocks (keyword + one of string/number/function).
    const nonEmptyCategories = Object.entries(byCategory)
      .filter(([, rs]) => Array.isArray(rs) && rs.length > 0)
      .map(([cat]) => cat)
    expect(nonEmptyCategories.length).toBeGreaterThanOrEqual(2)
  })

  test('injection decoration DOM classes show up under the editor', async ({ page }) => {
    test.setTimeout(30_000)
    await openFixture(page, 'injection-sample.lex')

    // Wait for ranges to apply, then verify the DOM carries the
    // `inline-injection-*` inline classes (at least one category).
    await expect
      .poll(
        async () => {
          const count = await page.evaluate(() => {
            const ranges = (window as any).lexTest?.getInjectionRanges?.() as
              | InjectionRange[]
              | undefined
            return ranges?.length ?? 0
          })
          return count
        },
        { timeout: 15_000 }
      )
      .toBeGreaterThan(0)

    // Any element carrying a `inline-injection-*` class means the Monaco
    // `inlineClassName` landed on the rendered tokens.
    await expect
      .poll(
        async () =>
          (await page.locator('[class*="inline-injection-"]').count()) +
          // Monaco also splits classes across tokens; fall back on the category
          // prefix if the above selector misses (some versions flatten the
          // class list).
          (await page.locator('.inline-injection-keyword').count()),
        { timeout: 15_000, message: 'Waiting for injection decoration DOM' }
      )
      .toBeGreaterThan(0)
  })
})
