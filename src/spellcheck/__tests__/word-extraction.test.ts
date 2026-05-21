import { describe, it, expect } from 'vitest'
import { extractCheckableWords } from '../word-extraction'

describe('extractCheckableWords', () => {
  it('extracts words from plain text', () => {
    const words = extractCheckableWords('Hello world')
    expect(words.map((w) => w.text)).toEqual(['Hello', 'world'])
  })

  it('returns correct positions (1-based)', () => {
    const words = extractCheckableWords('Hello world')
    expect(words[0]).toEqual({
      text: 'Hello',
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 6,
    })
    expect(words[1]).toEqual({
      text: 'world',
      startLine: 1,
      startColumn: 7,
      endLine: 1,
      endColumn: 12,
    })
  })

  it('handles multi-line text', () => {
    const words = extractCheckableWords('First line\nSecond line')
    expect(words.map((w) => w.text)).toEqual(['First', 'line', 'Second', 'line'])
    expect(words[2].startLine).toBe(2)
    expect(words[2].startColumn).toBe(1)
  })

  it('skips verbatim block bodies (subject + body + `:: lang ::` closer)', () => {
    // Real lex verbatim: a subject line, indented body, then `:: lang ::` closer.
    // The subject is prose (checked), the body is code (skipped), the closer is markers.
    const text = [
      'Before',
      '',
      'Pythn code example:',
      '\tlet x = 42;',
      ':: rust ::',
      '',
      'After',
    ].join('\n')
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['Before', 'Pythn', 'code', 'example', 'After'])
  })

  it('spell-checks annotation block bodies but skips the `:: label ::` opener and `::` closer', () => {
    const text = ':: note ::\n\tThis is inside\n::\n\nThis is outside'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['This', 'is', 'inside', 'This', 'is', 'outside'])
  })

  it('spell-checks the trailing descriptor on `:: label :: <text>` but not the label', () => {
    // The label `note` and the marker tokens are not prose; the trailing portion is.
    const text = ':: note :: this is teh descriptor'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['this', 'is', 'teh', 'descriptor'])
  })

  it('skips `:: label ::` alone (no trailing) — the whole line is markers', () => {
    const text = 'Before\n:: note ::\n:: data param=value ::'
    const words = extractCheckableWords(text)
    // The `:: note ::` line has no trailing — but it also has no body, so it's
    // a single annotation with no descriptor; nothing to spell-check on it.
    expect(words.map((w) => w.text)).toEqual(['Before'])
  })

  it('skips inline code', () => {
    const text = 'Use `forEach` to iterate'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['Use', 'to', 'iterate'])
  })

  it('skips inline math (`#…#` delimiter per lex spec)', () => {
    const text = 'The formula #E=mc^2# is famous'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['The', 'formula', 'is', 'famous'])
  })

  it('skips references', () => {
    const text = 'See [1] and [this reference] for details'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['See', 'and', 'for', 'details'])
  })

  it('skips URLs', () => {
    const text = 'Visit https://example.com for more'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['Visit', 'for', 'more'])
  })

  it('skips file paths', () => {
    const text = 'Edit ./src/main.rs and ../config.toml'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['Edit', 'and'])
  })

  it('keeps words with apostrophes', () => {
    const words = extractCheckableWords("don't won't it's")
    expect(words.map((w) => w.text)).toEqual(["don't", "won't", "it's"])
  })

  it('splits on hyphens', () => {
    const words = extractCheckableWords('well-known state-of-the-art')
    expect(words.map((w) => w.text)).toEqual(['well', 'known', 'state', 'of', 'the', 'art'])
  })

  it('handles empty input', () => {
    expect(extractCheckableWords('')).toEqual([])
  })

  it('handles text with only skipped content', () => {
    const text = '`code` [ref] #math#'
    const words = extractCheckableWords(text)
    expect(words).toEqual([])
  })

  it('handles indented content (sessions)', () => {
    const text = '    This is indented content'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['This', 'is', 'indented', 'content'])
  })

  it('handles space-indented verbatim blocks (lex spec: 4 spaces = 1 tab-stop)', () => {
    // Same shape as the tab-indented verbatim test above but with spaces.
    // Per welcome/general.lex §2 (Indentation), 4 spaces == 1 indent step.
    const text = [
      'Before',
      '',
      'Pythn code example:',
      '    let x = 42;',
      ':: rust ::',
      '',
      'After',
    ].join('\n')
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['Before', 'Pythn', 'code', 'example', 'After'])
  })

  it('handles space-indented annotation block bodies', () => {
    const text = ':: note ::\n    This is inside the annotation body\n::\n\nThis is outside'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual([
      'This',
      'is',
      'inside',
      'the',
      'annotation',
      'body',
      'This',
      'is',
      'outside',
    ])
  })
})
