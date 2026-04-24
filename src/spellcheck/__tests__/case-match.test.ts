import { describe, it, expect } from 'vitest'
import { matchWithCase } from '../case-match'

// The "dictionary" for these tests: canonical-casing entries, same
// shape the cspell-trie dictionaries ship with.
const DICT = new Set(['and', 'the', 'by', 'what', 'iPhone', 'macOS', 'GitHub', 'HTML', 'JWT'])
const lookup = (w: string) => DICT.has(w)

describe('matchWithCase', () => {
  it('accepts exact matches', () => {
    expect(matchWithCase(lookup, 'and')).toBe(true)
    expect(matchWithCase(lookup, 'iPhone')).toBe(true)
    expect(matchWithCase(lookup, 'HTML')).toBe(true)
  })

  it('accepts sentence-initial capitalization', () => {
    // `And` → try `and` → hit
    expect(matchWithCase(lookup, 'And')).toBe(true)
    expect(matchWithCase(lookup, 'The')).toBe(true)
    expect(matchWithCase(lookup, 'By')).toBe(true)
    expect(matchWithCase(lookup, 'What')).toBe(true)
  })

  it('accepts shouted ALL-CAPS of a lowercase word', () => {
    // `AND` → `and` → hit
    expect(matchWithCase(lookup, 'AND')).toBe(true)
    expect(matchWithCase(lookup, 'WHAT')).toBe(true)
  })

  it('accepts lowercase of an acronym as-written (via Title-case fallback is not triggered)', () => {
    // Acronyms are one-way: `HTML` matches strictly; users don't
    // typically type `html` for the abbreviation, and if they do we
    // don't want to silently accept it.
    expect(matchWithCase(lookup, 'html')).toBe(false)
    expect(matchWithCase(lookup, 'Html')).toBe(false)
    expect(matchWithCase(lookup, 'HTML')).toBe(true)
  })

  it('rejects unknown words regardless of case', () => {
    expect(matchWithCase(lookup, 'xyzzy')).toBe(false)
    expect(matchWithCase(lookup, 'Xyzzy')).toBe(false)
    expect(matchWithCase(lookup, 'XYZZY')).toBe(false)
  })

  it('does not forgive mixed-case brand names', () => {
    // `Iphone` is not the correct casing; we shouldn't let it slide
    // via lowercase fallback (lookup('iphone') is false).
    expect(matchWithCase(lookup, 'Iphone')).toBe(false)
    expect(matchWithCase(lookup, 'Macos')).toBe(false)
    expect(matchWithCase(lookup, 'Github')).toBe(false)
  })

  it('handles unicode uppercase starts', () => {
    // French capital É, Cyrillic capital Д, etc. should still trigger
    // the lowercase-fallback path.
    const fr = new Set(['élève'])
    expect(matchWithCase((w) => fr.has(w), 'Élève')).toBe(true)
  })
})
