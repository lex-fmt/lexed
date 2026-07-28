import { test, expect } from './lib'
import { openFixture } from './helpers'

/**
 * Injection highlighting inside `:: <lang> ::` verbatim blocks.
 *
 * The renderer composes two layers:
 *   1. `treesitter.ts` runs the lex grammar over the OUTER document and
 *      emits injection zones via the queries in `injections.scm`.
 *   2. `@lex/monaco-inline-injections` resolves each zone's annotation to
 *      a Monaco language id, tokenizes the zone content with Monaco's own
 *      Monarch tokenizer (`monaco.editor.tokenize`) and emits decorations.
 *
 * Per ADR-0001 (injected-language resolution belongs to the host) there is
 * no bundled per-language tree-sitter grammar: the injectable set is
 * whatever Monaco has registered, which is its full ~82-language basic set
 * rather than a curated five. The fixture exercises both halves of that
 * claim — the five languages the retired bundle shipped, plus `go` and
 * `sql`, which it did not and which are the demonstrable win.
 *
 * We assert that:
 *   1. Tree-sitter detects a zone for every annotated language.
 *   2. Every zone contributes at least one decoration (its Monaco
 *      tokenizer resolved via `LANGUAGE_ALIASES` and produced tokens).
 *   3. No decoration range leaks outside a zone into the surrounding prose.
 *   4. The output covers at least two decoration categories overall.
 */

// The five the retired embedded-grammar bundle shipped. `bash` is the
// interesting one: Monaco's id is `shell`, so it only lands if
// LANGUAGE_ALIASES targets Monaco's vocabulary.
const FORMERLY_BUNDLED = ['python', 'javascript', 'json', 'rust', 'bash'] as const
// Outside the retired bundle — under the tree-sitter tokenizer these got no
// highlighting at all. Decorations here are the coverage win.
const BEYOND_BUNDLE = ['go', 'sql'] as const
const ANNOTATED_LANGUAGES = [...FORMERLY_BUNDLED, ...BEYOND_BUNDLE]
type AnnotatedLanguage = (typeof ANNOTATED_LANGUAGES)[number]

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

/** Ranges that fall inside a zone's line span. */
function rangesInZone(ranges: InjectionRange[], zone: InjectionZone): InjectionRange[] {
  return ranges.filter((r) => r.startLine >= zone.startRow && r.endLine <= zone.endRow)
}

test.describe('Injection Highlighting', () => {
  test('produces categorised ranges for every annotated language', async ({ page }) => {
    test.setTimeout(45_000)

    await openFixture(page, 'injection-sample.lex')

    // Tree-sitter WASM and each Monarch tokenizer load asynchronously; the
    // shared module's debounce window is 250 ms. Poll until we see zones
    // for every annotated language (zone discovery ready).
    await expect
      .poll(
        async () => {
          const zones = (await page.evaluate(() => window.__e2e.bridge?.getInjectionZones?.())) as
            | InjectionZone[]
            | undefined
          if (!zones) return 0
          const langs = new Set(zones.map((z) => z.language))
          return ANNOTATED_LANGUAGES.filter((l) => langs.has(l)).length
        },
        {
          timeout: 20_000,
          message: 'Waiting for tree-sitter to detect every annotated zone'
        }
      )
      .toBe(ANNOTATED_LANGUAGES.length)

    // Force a refresh so we don't race the debounce timer, then poll until
    // every zone has at least one range. Monaco's tokenizers are lazily
    // loaded per language (the highlighter primes each on first use), so
    // the first pass can legitimately come back short; `refresh()` after
    // priming is what makes it converge.
    await expect
      .poll(
        async () => {
          await page.evaluate(() => window.__e2e.bridge.refreshInjectionHighlighter())
          const { zones, ranges } = await page.evaluate(() => {
            const api = window.__e2e.bridge
            return {
              zones: api.getInjectionZones() as InjectionZone[],
              ranges: api.getInjectionRanges() as InjectionRange[]
            }
          })
          // Report the languages still without decorations, not a count —
          // a failure here should name the language that didn't tokenize.
          return ANNOTATED_LANGUAGES.filter((lang) => {
            const zone = zones.find((z) => z.language === lang)
            return !zone || rangesInZone(ranges, zone).length === 0
          })
        },
        {
          timeout: 20_000,
          message: 'Waiting for every annotated zone to produce decorations'
        }
      )
      .toEqual([])

    const { zones, ranges, byCategory } = await page.evaluate(() => {
      const api = window.__e2e.bridge
      return {
        zones: api.getInjectionZones() as InjectionZone[],
        ranges: api.getInjectionRanges() as InjectionRange[],
        byCategory: api.getInjectionRangesByCategory() as Record<string, InjectionRange[]>
      }
    })

    // Every annotated language must have its zone present.
    const zoneByLang = new Map<AnnotatedLanguage, InjectionZone>()
    for (const lang of ANNOTATED_LANGUAGES) {
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

    // Every annotated language must contribute at least one range — for the
    // formerly-bundled five this is the no-regression check; for `go`/`sql`
    // it is the new coverage the Monaco path buys.
    for (const lang of ANNOTATED_LANGUAGES) {
      expect(
        rangesInZone(ranges, zoneByLang.get(lang)!).length,
        `expected at least one decoration range inside the "${lang}" zone`
      ).toBeGreaterThan(0)
    }

    // Categorised output: at least two distinct categories should fire
    // across the fixture. Shell emits comments + keywords; JSON emits
    // strings + numbers; etc. — any pairing satisfies this.
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
