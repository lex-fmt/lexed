import { describe, it, expect } from 'vitest';
import { injections } from '@lex/shared';

const { mapTokensToDecorations } = injections;
type InjectionRange = injections.InjectionRange;
type DecorationCategory = injections.DecorationCategory;
type InjectionZone = injections.InjectionZone;

function emptyRanges(): Map<DecorationCategory, InjectionRange[]> {
  return new Map<DecorationCategory, InjectionRange[]>([
    ['keyword', []],
    ['string', []],
    ['comment', []],
    ['number', []],
    ['type', []],
    ['function', []],
    ['operator', []],
  ]);
}

const ZONE: InjectionZone = {
  language: 'python',
  text: 'placeholder',
  startRow: 10,
  startCol: 4,
  endRow: 20,
  endCol: 0,
};

// Standard LSP semantic-token legend — `keyword` at index 0, `string` at 1, etc.
const LEGEND = {
  tokenTypes: ['keyword', 'string', 'comment', 'number', 'operator', 'variable'],
};

describe('mapTokensToDecorations', () => {
  it('single token on line 0 uses zone.startCol offset', () => {
    const ranges = emptyRanges();
    // One keyword token at (0, 2), length 3
    const data = new Uint32Array([0, 2, 3, 0, 0]);
    mapTokensToDecorations({ legend: LEGEND, data }, ZONE, ranges);

    const kw = ranges.get('keyword')!;
    expect(kw).toHaveLength(1);
    expect(kw[0]).toEqual({
      startLine: 10, // zone.startRow + 0
      startCol: 6, // zone.startCol (4) + startChar (2)
      endLine: 10,
      endCol: 9, // startCol + length (3)
    });
  });

  it('multi-line delta — subsequent lines use raw startChar', () => {
    const ranges = emptyRanges();
    // Two tokens: keyword at virtual (0, 0) len 3, string at virtual (2, 4) len 5
    const data = new Uint32Array([0, 0, 3, 0, 0, 2, 4, 5, 1, 0]);
    mapTokensToDecorations({ legend: LEGEND, data }, ZONE, ranges);

    const kw = ranges.get('keyword')!;
    const str = ranges.get('string')!;
    expect(kw).toHaveLength(1);
    expect(kw[0]).toEqual({
      startLine: 10,
      startCol: 4,
      endLine: 10,
      endCol: 7,
    });
    expect(str).toHaveLength(1);
    expect(str[0]).toEqual({
      startLine: 12,
      startCol: 4,
      endLine: 12,
      endCol: 9,
    });
  });

  it('same-line delta accumulates startChar', () => {
    const ranges = emptyRanges();
    const data = new Uint32Array([0, 0, 3, 0, 0, 0, 5, 4, 1, 0]);
    mapTokensToDecorations({ legend: LEGEND, data }, ZONE, ranges);

    const kw = ranges.get('keyword')!;
    const str = ranges.get('string')!;
    expect(kw).toHaveLength(1);
    expect(kw[0]).toEqual({
      startLine: 10,
      startCol: 4,
      endLine: 10,
      endCol: 7,
    });
    expect(str).toHaveLength(1);
    expect(str[0]).toEqual({
      startLine: 10,
      startCol: 9,
      endLine: 10,
      endCol: 13,
    });
  });

  it('unknown token-type index (out of legend) is skipped', () => {
    const ranges = emptyRanges();
    const data = new Uint32Array([0, 0, 3, 99, 0]);
    mapTokensToDecorations({ legend: LEGEND, data }, ZONE, ranges);

    for (const [, list] of ranges) {
      expect(list).toHaveLength(0);
    }
  });

  it('unmapped token-type name (e.g. variable) is skipped', () => {
    const ranges = emptyRanges();
    const data = new Uint32Array([0, 0, 3, 5, 0]);
    mapTokensToDecorations({ legend: LEGEND, data }, ZONE, ranges);

    for (const [, list] of ranges) {
      expect(list).toHaveLength(0);
    }
  });

  it('routes aliased token types to the right category', () => {
    const ranges = emptyRanges();
    const legend = {
      tokenTypes: ['class', 'method', 'regexp', 'modifier', 'macro', 'namespace'],
    };
    const data = new Uint32Array([
      0, 0, 1, 0, 0, // class → type
      1, 0, 1, 1, 0, // method → function
      1, 0, 1, 2, 0, // regexp → string
      1, 0, 1, 3, 0, // modifier → keyword
      1, 0, 1, 4, 0, // macro → function
      1, 0, 1, 5, 0, // namespace → type
    ]);
    mapTokensToDecorations({ legend, data }, ZONE, ranges);

    expect(ranges.get('type')!).toHaveLength(2);
    expect(ranges.get('function')!).toHaveLength(2);
    expect(ranges.get('string')!).toHaveLength(1);
    expect(ranges.get('keyword')!).toHaveLength(1);
  });

  it('empty data produces no ranges', () => {
    const ranges = emptyRanges();
    mapTokensToDecorations({ legend: LEGEND, data: new Uint32Array([]) }, ZONE, ranges);
    for (const [, list] of ranges) {
      expect(list).toHaveLength(0);
    }
  });

  it('zone with startRow=0 still maps line 0 correctly', () => {
    const ranges = emptyRanges();
    const zone: InjectionZone = {
      language: 'python',
      text: 'x',
      startRow: 0,
      startCol: 8,
      endRow: 2,
      endCol: 0,
    };
    const data = new Uint32Array([0, 1, 2, 0, 0]);
    mapTokensToDecorations({ legend: LEGEND, data }, zone, ranges);
    const kw = ranges.get('keyword')!;
    expect(kw).toHaveLength(1);
    expect(kw[0]).toEqual({
      startLine: 0,
      startCol: 9,
      endLine: 0,
      endCol: 11,
    });
  });
});
