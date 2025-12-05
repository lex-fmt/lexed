
import { describe, it, expect } from 'vitest';
import { calculateSnippetInsertion, isSnippetInsertionPayload } from '@/lib/editing';

describe('Editing Logic', () => {
    describe('isSnippetInsertionPayload', () => {
        it('should return true for valid payload', () => {
            expect(isSnippetInsertionPayload({ text: 'foo', cursorOffset: 0 })).toBe(true);
        });

        it('should return false for invalid payload', () => {
            expect(isSnippetInsertionPayload({ text: 'foo' })).toBe(false);
            expect(isSnippetInsertionPayload({ cursorOffset: 0 })).toBe(false);
            expect(isSnippetInsertionPayload(null)).toBe(false);
            expect(isSnippetInsertionPayload(123)).toBe(false);
        });
    });

    describe('calculateSnippetInsertion', () => {
        it('should handle insertion at start of file', () => {
            const payload = { text: 'Hello', cursorOffset: 2 };
            const result = calculateSnippetInsertion(payload, 1, 1, 0);

            expect(result.textToInsert).toBe('Hello\n');
            expect(result.prefix).toBe('');
            expect(result.newCursorOffset).toBe(2);
        });

        it('should handle insertion in middle of file', () => {
            const payload = { text: 'Hello', cursorOffset: 2 };
            // Line 2, Col 1. Assume offset 10.
            const result = calculateSnippetInsertion(payload, 2, 1, 10);

            expect(result.textToInsert).toBe('\nHello\n');
            expect(result.prefix).toBe('\n');
            expect(result.newCursorOffset).toBe(13); // 10 + 1 (\n) + 2
        });
    });
});
