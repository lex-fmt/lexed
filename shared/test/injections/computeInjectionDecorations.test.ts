import { describe, it, expect } from 'vitest';
import { injections } from '@lex/shared';

const { computeInjectionDecorations } = injections;
type InjectionZone = injections.InjectionZone;
type InjectionHostAdapter = injections.InjectionHostAdapter;
type SemanticTokens = injections.SemanticTokens;

function makeZone(lang: string, text: string, row: number, col: number): InjectionZone {
  return {
    language: lang,
    text,
    startRow: row,
    startCol: col,
    endRow: row + 3,
    endCol: 0,
  };
}

const KW_STR_LEGEND = { tokenTypes: ['keyword', 'string'] };

function tokensPayload(data: Uint32Array): SemanticTokens {
  return { legend: KW_STR_LEGEND, data };
}

describe('computeInjectionDecorations', () => {
  it('aggregates ranges across multiple zones', async () => {
    const zones = [
      makeZone('python', 'def x: pass', 10, 2),
      makeZone('javascript', 'const y = 1', 20, 0),
    ];

    const host: InjectionHostAdapter = {
      getRegisteredLanguages: () => Promise.resolve(new Set(['python', 'javascript'])),
      getSemanticTokens: () => Promise.resolve(tokensPayload(new Uint32Array([0, 0, 3, 0, 0]))),
    };

    const ranges = await computeInjectionDecorations(zones, host);
    const kw = ranges.get('keyword')!;
    expect(kw).toHaveLength(2);
    expect(kw[0]).toEqual({ startLine: 10, startCol: 2, endLine: 10, endCol: 5 });
    expect(kw[1]).toEqual({ startLine: 20, startCol: 0, endLine: 20, endCol: 3 });

    for (const category of ['string', 'comment', 'number', 'type', 'function', 'operator'] as const) {
      expect(ranges.get(category)).toEqual([]);
    }
  });

  it('unregistered language is skipped', async () => {
    const zones = [makeZone('python', 'def x', 0, 0), makeZone('cobol', 'DISPLAY "X"', 5, 0)];
    let calls = 0;
    const host: InjectionHostAdapter = {
      getRegisteredLanguages: () => Promise.resolve(new Set(['python'])),
      getSemanticTokens: () => {
        calls++;
        return Promise.resolve(tokensPayload(new Uint32Array([0, 0, 3, 0, 0])));
      },
    };

    const ranges = await computeInjectionDecorations(zones, host);
    expect(calls).toBe(1);
    expect(ranges.get('keyword')!).toHaveLength(1);
  });

  it('null tokens skip the zone silently', async () => {
    const zones = [makeZone('python', 'x', 0, 0), makeZone('rust', 'y', 5, 0)];
    const host: InjectionHostAdapter = {
      getRegisteredLanguages: () => Promise.resolve(new Set(['python', 'rust'])),
      getSemanticTokens: (zoneIndex) =>
        Promise.resolve(zoneIndex === 0 ? tokensPayload(new Uint32Array([0, 0, 1, 0, 0])) : null),
    };

    const ranges = await computeInjectionDecorations(zones, host);
    expect(ranges.get('keyword')!).toHaveLength(1);
  });

  it('thrown error skips the zone, does not bubble', async () => {
    const zones = [makeZone('python', 'x', 0, 0), makeZone('rust', 'y', 5, 0)];
    const host: InjectionHostAdapter = {
      getRegisteredLanguages: () => Promise.resolve(new Set(['python', 'rust'])),
      getSemanticTokens: (zoneIndex) => {
        if (zoneIndex === 1) return Promise.reject(new Error('provider boom'));
        return Promise.resolve(tokensPayload(new Uint32Array([0, 0, 1, 0, 0])));
      },
    };

    const ranges = await computeInjectionDecorations(zones, host);
    expect(ranges.get('keyword')!).toHaveLength(1);
  });

  it('synchronous throw from getSemanticTokens is also skipped', async () => {
    const zones = [makeZone('python', 'x', 0, 0), makeZone('rust', 'y', 5, 0)];
    const host: InjectionHostAdapter = {
      getRegisteredLanguages: () => Promise.resolve(new Set(['python', 'rust'])),
      getSemanticTokens: (zoneIndex) => {
        if (zoneIndex === 1) throw new Error('sync boom');
        return Promise.resolve(tokensPayload(new Uint32Array([0, 0, 1, 0, 0])));
      },
    };

    const ranges = await computeInjectionDecorations(zones, host);
    expect(ranges.get('keyword')!).toHaveLength(1);
  });

  it('empty zones returns all-empty category map', async () => {
    const host: InjectionHostAdapter = {
      getRegisteredLanguages: () =>
        Promise.reject(new Error('should not be called when zones is empty')),
      getSemanticTokens: () =>
        Promise.reject(new Error('should not be called when zones is empty')),
    };
    const ranges = await computeInjectionDecorations([], host);
    expect(ranges.size).toBe(7);
    for (const [, list] of ranges) {
      expect(list).toHaveLength(0);
    }
  });

  it('getRegisteredLanguages called exactly once per invocation', async () => {
    const zones = [
      makeZone('python', 'a', 0, 0),
      makeZone('python', 'b', 5, 0),
      makeZone('javascript', 'c', 10, 0),
    ];
    let registeredCalls = 0;
    const host: InjectionHostAdapter = {
      getRegisteredLanguages: () => {
        registeredCalls++;
        return Promise.resolve(new Set(['python', 'javascript']));
      },
      getSemanticTokens: () => Promise.resolve(tokensPayload(new Uint32Array([]))),
    };

    await computeInjectionDecorations(zones, host);
    expect(registeredCalls).toBe(1);
  });

  it('zone index passed to host matches zones array index', async () => {
    const zones = [
      makeZone('python', 'first', 0, 0),
      makeZone('python', 'second', 5, 0),
      makeZone('python', 'third', 10, 0),
    ];
    const seen: Array<{ idx: number; content: string; lang: string }> = [];
    const host: InjectionHostAdapter = {
      getRegisteredLanguages: () => Promise.resolve(new Set(['python'])),
      getSemanticTokens: (zoneIndex, content, langId) => {
        seen.push({ idx: zoneIndex, content, lang: langId });
        return Promise.resolve(tokensPayload(new Uint32Array([])));
      },
    };

    await computeInjectionDecorations(zones, host);
    expect(seen).toEqual([
      { idx: 0, content: 'first', lang: 'python' },
      { idx: 1, content: 'second', lang: 'python' },
      { idx: 2, content: 'third', lang: 'python' },
    ]);
  });
});
