import { describe, it, expect } from 'vitest'
import {
  calculateSnippetInsertion,
  isSnippetInsertionPayload,
  isPreparePasteResponse,
  computePasteEndPosition
} from '@/lib/editing'

describe('Editing Logic', () => {
  describe('isSnippetInsertionPayload', () => {
    it('should return true for valid payload', () => {
      expect(isSnippetInsertionPayload({ text: 'foo', cursorOffset: 0 })).toBe(true)
    })

    it('should return false for invalid payload', () => {
      expect(isSnippetInsertionPayload({ text: 'foo' })).toBe(false)
      expect(isSnippetInsertionPayload({ cursorOffset: 0 })).toBe(false)
      expect(isSnippetInsertionPayload(null)).toBe(false)
      expect(isSnippetInsertionPayload(123)).toBe(false)
    })
  })

  describe('calculateSnippetInsertion', () => {
    it('should handle insertion at start of file', () => {
      const payload = { text: 'Hello', cursorOffset: 2 }
      const result = calculateSnippetInsertion(payload, 1, 1, 0)

      expect(result.textToInsert).toBe('Hello\n')
      expect(result.prefix).toBe('')
      expect(result.newCursorOffset).toBe(2)
    })

    it('should handle insertion in middle of file', () => {
      const payload = { text: 'Hello', cursorOffset: 2 }
      // Line 2, Col 1. Assume offset 10.
      const result = calculateSnippetInsertion(payload, 2, 1, 10)

      expect(result.textToInsert).toBe('\nHello\n')
      expect(result.prefix).toBe('\n')
      expect(result.newCursorOffset).toBe(13) // 10 + 1 (\n) + 2
    })
  })

  describe('isPreparePasteResponse', () => {
    it('accepts a well-formed re-anchor response', () => {
      expect(isPreparePasteResponse({ mode: 're-anchor', text: 'foo\n  bar' })).toBe(true)
    })

    it('accepts each passthrough mode', () => {
      expect(isPreparePasteResponse({ mode: 'passthrough-verbatim', text: 'x' })).toBe(true)
      expect(isPreparePasteResponse({ mode: 'passthrough-table', text: 'x' })).toBe(true)
      expect(isPreparePasteResponse({ mode: 'passthrough-single-line', text: 'x' })).toBe(true)
    })

    it('rejects null (server declined → native fallback)', () => {
      expect(isPreparePasteResponse(null)).toBe(false)
    })

    it('rejects payloads missing a field', () => {
      expect(isPreparePasteResponse({ mode: 're-anchor' })).toBe(false)
      expect(isPreparePasteResponse({ text: 'foo' })).toBe(false)
      expect(isPreparePasteResponse({ mode: 1, text: 'foo' })).toBe(false)
      expect(isPreparePasteResponse({ mode: 're-anchor', text: 42 })).toBe(false)
      expect(isPreparePasteResponse(undefined)).toBe(false)
    })

    it('rejects an unknown mode so the type predicate stays sound', () => {
      expect(isPreparePasteResponse({ mode: 'bogus', text: 'foo' })).toBe(false)
      expect(isPreparePasteResponse({ mode: 'toString', text: 'foo' })).toBe(false)
    })
  })

  describe('computePasteEndPosition', () => {
    it('advances the column for single-line text', () => {
      // caret at (line 2, col 5), paste "hello" (5 chars) → col 10, same line
      expect(computePasteEndPosition('hello', 2, 5)).toEqual({ lineNumber: 2, column: 10 })
    })

    it('handles empty text (no movement)', () => {
      expect(computePasteEndPosition('', 3, 4)).toEqual({ lineNumber: 3, column: 4 })
    })

    it('moves to the last line for multi-line text', () => {
      // "a\n  bc" → 1 newline, last segment "  bc" (len 4) → col 5 on line+1
      expect(computePasteEndPosition('a\n  bc', 2, 5)).toEqual({ lineNumber: 3, column: 5 })
    })

    it('handles a trailing newline (caret at column 1 of the new line)', () => {
      expect(computePasteEndPosition('foo\n', 1, 1)).toEqual({ lineNumber: 2, column: 1 })
    })
  })
})
