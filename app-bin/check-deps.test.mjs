import { describe, it, expect } from 'vitest'
import { requiredArtifacts, findMissing, computeMissing } from './check-deps.mjs'

// Minimal stand-in shaped like the real deps.json.
const deps = {
  'lexd-lsp': { dest: 'resources', binary: 'lexd-lsp' },
  'tree-sitter': {
    extract: {
      'tree-sitter-lex.wasm': 'resources',
      queries: 'resources/queries',
    },
  },
}

// The lexd-lsp binary on disk is platform-suffixed (.exe on Windows).
const lspBinary = process.platform === 'win32' ? 'resources/lexd-lsp.exe' : 'resources/lexd-lsp'

describe('check-deps preflight', () => {
  describe('requiredArtifacts', () => {
    const req = requiredArtifacts(deps)

    it('includes the tree-sitter wasm + query files the build statically imports', () => {
      expect(req).toContain('resources/tree-sitter-lex.wasm')
      expect(req).toContain('resources/queries/highlights.scm')
      expect(req).toContain('resources/queries/injections.scm')
    })

    it('includes the lexd-lsp binary (platform-suffixed) derived from deps.json dest + binary', () => {
      expect(req).toContain(lspBinary)
    })

    it('requires no embedded-grammar artifacts (INJ001: Monaco resolves injected languages)', () => {
      expect(req.filter((p) => p.includes('embedded-grammars'))).toEqual([])
    })

    it('emits forward-slash (POSIX) repo-relative paths on every platform', () => {
      for (const p of req) {
        expect(p).not.toContain('\\')
      }
    })
  })

  describe('findMissing — the fail-fast signal', () => {
    const req = requiredArtifacts(deps)

    it('reports nothing missing when every artifact is present', () => {
      expect(findMissing(req, () => true)).toEqual([])
    })

    it('flags exactly the absent artifacts (the #142 regression: wasm + queries gone)', () => {
      const absent = new Set([
        'resources/tree-sitter-lex.wasm',
        'resources/queries/highlights.scm',
        'resources/queries/injections.scm',
      ])
      const missing = findMissing(req, (p) => !absent.has(p))
      expect(new Set(missing)).toEqual(absent)
    })
  })

  describe('computeMissing — manifest absence is a reported miss, not a crash', () => {
    const readAll = () => deps
    const presentAll = () => true

    it('reports nothing missing when the manifest and artifacts are all present', () => {
      expect(computeMissing(readAll, presentAll)).toEqual([])
    })

    it('reports a missing deps.json instead of throwing', () => {
      const readNoDeps = () => null
      const missing = computeMissing(readNoDeps, presentAll)
      expect(missing).toContain('deps.json')
    })

    it('derives nothing (and does not throw) when deps.json is unreadable', () => {
      expect(computeMissing(() => null, presentAll)).toEqual(['deps.json'])
    })
  })
})
