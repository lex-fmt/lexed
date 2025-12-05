
import { describe, it, expect } from 'vitest';
import { isLocation } from '@/lib/navigation';

describe('Navigation Logic', () => {
    describe('isLocation', () => {
        it('should return true for valid Location', () => {
            const valid = {
                uri: 'file:///tmp/foo.lex',
                range: {
                    start: { line: 1, character: 1 },
                    end: { line: 1, character: 5 }
                }
            };
            expect(isLocation(valid)).toBe(true);
        });

        it('should return false for invalid Location', () => {
            expect(isLocation(null)).toBe(false);
            expect(isLocation({})).toBe(false);
            expect(isLocation({ uri: 123 })).toBe(false);
            expect(isLocation({ range: 'foo' })).toBe(false);
            // Missing range
            expect(isLocation({ uri: 'file://foo' })).toBe(false);
        });
    });
});
