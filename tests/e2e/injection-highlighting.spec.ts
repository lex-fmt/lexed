import { test, expect } from './lib'
import { openFixture } from './helpers'

/**
 * Injection highlighting inside `:: <lang> ::` verbatim blocks.
 *
 * The renderer composes three layers:
 *   1. `treesitter.ts` runs the lex grammar over the document and emits
 *      injection zones via the queries in `injections.scm`.
 *   2. `embedded.ts` is a per-language tokenizer that loads the bundled
 *      tree-sitter grammar from `resources/embedded-grammars/<lang>/`
 *      and runs that grammar's `highlights.scm` over each zone's content.
 *   3. `@lex/monaco-inline-injections` glues those two together and
 *      emits Monaco decorations.
 *
 * We verify the full pipeline end-to-end by opening a fixture with one
 * verbatim block per bundled language (python, javascript, json, rust,
 * bash) and asserting that:
 *   1. Tree-sitter detects all five zones (zone discovery works).
 *   2. Every decoration range falls inside one of the zones (no leak).
 *   3. Every zone contributes at least one decoration (the per-language
 *      grammar loaded and its highlights query produced captures).
 *   4. The output covers at least two decoration categories overall —
 *      the bundled grammars between them produce more than just one
 *      kind of token.
 */

const BUNDLED_LANGUAGES = ['python', 'javascript', 'json', 'rust', 'bash'] as const
type BundledLanguage = (typeof BUNDLED_LANGUAGES)[number]

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
  test('produces categorised ranges for every bundled language', async ({ page }) => {
    test.setTimeout(45_000)

    await openFixture(page, 'injection-sample.lex')

    // Tree-sitter WASM and each language grammar load asynchronously;
    // the shared module's debounce window is 250 ms. Poll until we see
    // zones for every bundled language (zone discovery + grammar
    // resolution ready) and then until at least one range lands per
    // zone (per-language tokenizer ready).
    await expect
      .poll(
        async () => {
          const zones = (await page.evaluate(() => window.__e2e.bridge?.getInjectionZones?.())) as
            | InjectionZone[]
            | undefined
          if (!zones) return 0
          const langs = new Set(zones.map((z) => z.language))
          return BUNDLED_LANGUAGES.filter((l) => langs.has(l)).length
        },
        {
          timeout: 20_000,
          message: 'Waiting for tree-sitter to detect every bundled-language zone',
        }
      )
      .toBe(BUNDLED_LANGUAGES.length)

    // Force a refresh so we don't race the debounce timer.
    await page.evaluate(() => window.__e2e.bridge.refreshInjectionHighlighter())

    // Wait until ranges have materialised for *every* bundled language —
    // not just any one. Loading + parsing each WASM is async, so the
    // first refresh may only have a subset wired up.
    await expect
      .poll(
        async () => {
          const result = await page.evaluate(
            (bundled) => {
              const api = window.__e2e.bridge
              const zones = api.getInjectionZones() as Array<{
                language: string
                startRow: number
                endRow: number
              }>
              const ranges = api.getInjectionRanges() as Array<{
                startLine: number
                endLine: number
              }>
              return bundled.filter((lang) => {
                const zone = zones.find((z) => z.language === lang)
                if (!zone) return false
                return ranges.some((r) => r.startLine >= zone.startRow && r.endLine <= zone.endRow)
              }).length
            },
            BUNDLED_LANGUAGES as unknown as string[]
          )
          return result
        },
        {
          timeout: 15_000,
          message: 'Waiting for ranges to materialise inside every bundled-language zone',
        }
      )
      .toBe(BUNDLED_LANGUAGES.length)

    const { zones, ranges, byCategory } = await page.evaluate(() => {
      const api = window.__e2e.bridge
      return {
        zones: api.getInjectionZones() as InjectionZone[],
        ranges: api.getInjectionRanges() as InjectionRange[],
        byCategory: api.getInjectionRangesByCategory() as Record<string, InjectionRange[]>,
      }
    })

    // Every bundled language must have its zone present.
    const zoneByLang = new Map<BundledLanguage, InjectionZone>()
    for (const lang of BUNDLED_LANGUAGES) {
      const zone = zones.find((z) => z.language === lang)
      expect(zone, `expected an injection zone for "${lang}"`).toBeDefined()
      zoneByLang.set(lang, zone!)
    }

    // Every range must fall inside some zone's line span.
    const zoneContains = (r: InjectionRange) =>
      zones.some((z) => r.startLine >= z.startRow && r.endLine <= z.endRow)
    for (const r of ranges) {
      expect(
        zoneContains(r),
        `range ${JSON.stringify(r)} should fall inside an injection zone`
      ).toBe(true)
    }

    // Every bundled language must contribute at least one range — proves
    // each language's tree-sitter grammar loaded and its highlights query
    // produced captures.
    for (const lang of BUNDLED_LANGUAGES) {
      const zone = zoneByLang.get(lang)!
      const langRanges = ranges.filter(
        (r) => r.startLine >= zone.startRow && r.endLine <= zone.endRow
      )
      expect(
        langRanges.length,
        `expected at least one decoration range inside the "${lang}" zone`
      ).toBeGreaterThan(0)
    }

    // Categorised output: at least two distinct categories should fire
    // across the bundle. Bash's grammar emits comments + keywords; JSON
    // emits strings + numbers; etc. — any pairing satisfies this.
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
            const ranges = window.__e2e.bridge?.getInjectionRanges?.() as
              | InjectionRange[]
              | undefined
            return ranges?.length ?? 0
          })
          return count
        },
        { timeout: 15_000 }
      )
      .toBeGreaterThan(0)

    // Any element carrying an `inline-injection-*` class means the Monaco
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
