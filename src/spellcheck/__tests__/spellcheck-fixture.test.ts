import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractCheckableWords } from '../word-extraction'

/**
 * End-to-end check that the word extractor honors the canonical spell-check
 * policy against the upstream fixture (`tree-sitter-lex/test/spellcheck-fixture.lex`,
 * mirrored here).
 *
 * The fixture seeds deliberate typos at every prose / non-prose position;
 * this test asserts which typos the extractor surfaces (= will be flagged
 * by the spell checker) and which it suppresses (= correctly hidden inside
 * code / labels / verbatim bodies).
 *
 * Keep this fixture in sync with the upstream — copy it across when the
 * tree-sitter-lex version bumps.
 */
describe('spellcheck-fixture e2e', () => {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const text = readFileSync(join(__dirname, 'spellcheck-fixture.lex'), 'utf8')
  const words = extractCheckableWords(text)
  const wordSet = new Set(words.map((w) => w.text))

  describe('prose positions surface their typos', () => {
    it.each([
      ['Spelchek', 'doc title'],
      ['contians', 'subtitle prose'],
      ['recieve', 'subtitle prose'],
      ['Sectoin', 'session title'],
      ['occured', 'paragraph prose'],
      ['behaviuor', 'paragraph prose'],
      ['Mispelled', 'list item / definition subject'],
      ['Brokn', 'table caption'],
      ['Coloumn', 'table header cell'],
      ['Pythn', 'verbatim subject (prose per policy)']
    ])('flags %s (%s)', (typo) => {
      expect(wordSet.has(typo)).toBe(true)
    })

    it('flags the trailing descriptor after `:: note :: …`', () => {
      // Line 28 in fixture: `:: note :: trailing descriptor with teh typo`
      const teh = words.find((w) => w.startLine === 28 && w.text === 'teh')
      expect(teh, 'expected `teh` from the trailing descriptor').toBeDefined()
    })
  })

  describe('non-prose positions suppress their typos', () => {
    it('suppresses verbatim body typos (`teh_function`, `recieve = 1`, `return recieve`)', () => {
      // Lines 22-25 are inside the verbatim block body — none of those positions
      // should appear in the extracted words.
      const verbatimBodyLines = new Set([22, 23, 24, 25])
      const leaks = words.filter((w) => verbatimBodyLines.has(w.startLine))
      expect(leaks).toEqual([])
    })

    it('suppresses the annotation label `nott_a_typo_label`', () => {
      // Line 29 is `:: note nott_a_typo_label param=ignoreMe ::` — entire line
      // is markers + label/params, no trailing descriptor.
      const labelLeaks = words.filter((w) => w.startLine === 29)
      expect(labelLeaks).toEqual([])
    })

    it('suppresses inline code-span and math-span contents', () => {
      // Line 38 has `` `teh code span` `` and `#teh math#` — the inner words
      // (`code`, `span`, `math`) must not surface, though surrounding prose
      // (`A`, `paragraph`, `with`, `and`, `that`, `should`, `be`, `ignored`) does.
      const line38Words = words.filter((w) => w.startLine === 38).map((w) => w.text)
      expect(line38Words).not.toContain('code')
      expect(line38Words).not.toContain('span')
      expect(line38Words).not.toContain('math')
      // Sanity: surrounding prose is checked.
      expect(line38Words).toContain('paragraph')
      expect(line38Words).toContain('ignored')
    })

    it('suppresses reference contents (`[teh refernce]`)', () => {
      // Line 39 has `plus a [teh refernce] that is also ignored.` — the
      // bracketed reference text must not surface, but the surrounding
      // prose (`plus`, `also`, `ignored`) does.
      const line39Words = words.filter((w) => w.startLine === 39).map((w) => w.text)
      expect(line39Words).not.toContain('teh')
      expect(line39Words).not.toContain('refernce')
      expect(line39Words).toContain('plus')
      expect(line39Words).toContain('ignored')
    })
  })

  describe('annotation block bodies are spell-checked', () => {
    it('surfaces typos inside `:: note :: … ::` block body', () => {
      // Lines 32-33 are the annotation block body — should be spell-checked
      // (annotation block bodies are prose per policy).
      const bodyWords = words.filter((w) => w.startLine === 32 || w.startLine === 33)
      const texts = new Set(bodyWords.map((w) => w.text))
      expect(texts.has('contians')).toBe(true)
      expect(texts.has('teh')).toBe(true)
    })
  })
})
