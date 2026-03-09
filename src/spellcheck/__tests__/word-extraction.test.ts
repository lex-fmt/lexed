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

  it('skips verbatim blocks', () => {
    const text = 'Before\n\n:: rust ::\nlet x = 42;\n::\n\nAfter'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['Before', 'After'])
  })

  it('skips inline code', () => {
    const text = 'Use `forEach` to iterate'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['Use', 'to', 'iterate'])
  })

  it('skips inline math', () => {
    const text = 'The formula $E=mc^2$ is famous'
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

  it('keeps hyphenated words', () => {
    const words = extractCheckableWords('well-known state-of-the-art')
    expect(words.map((w) => w.text)).toEqual(['well-known', 'state-of-the-art'])
  })

  it('skips annotation/verbatim blocks entirely', () => {
    // :: label :: opens a verbatim/annotation block, :: closes it.
    // The heuristic treats both annotations and verbatim the same way
    // (toggle on open marker, toggle on close marker).
    const text = ':: note ::\nThis is inside\n::\n\nThis is outside'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['This', 'is', 'outside'])
  })

  it('handles empty input', () => {
    expect(extractCheckableWords('')).toEqual([])
  })

  it('handles text with only skipped content', () => {
    const text = '`code` [ref] $math$'
    const words = extractCheckableWords(text)
    expect(words).toEqual([])
  })

  it('handles indented content (sessions)', () => {
    const text = '    This is indented content'
    const words = extractCheckableWords(text)
    expect(words.map((w) => w.text)).toEqual(['This', 'is', 'indented', 'content'])
  })
})
