import { describe, it, expect } from 'vitest'
import { requiredArtifacts, findMissing, computeMissing } from './check-deps.mjs'

// Minimal stand-ins shaped like the real deps.json / embedded-grammars.json.
const deps = {
  'lexd-lsp': { dest: 'resources', binary: 'lexd-lsp' },
  'tree-sitter': {
    extract: {
      'tree-sitter-lex.wasm': 'resources',
      queries: 'resources/queries',
      'shared/embedded-grammars.json': 'resources',
    },
  },
}

const grammars = {
  grammars: [{ name: 'python' }, { name: 'rust' }],
}

// The lexd-lsp binary on disk is platform-suffixed (.exe on Windows).
const lspBinary = process.platform === 'win32' ? 'resources/lexd-lsp.exe' : 'resources/lexd-lsp'

describe('check-deps preflight', () => {
  describe('requiredArtifacts', () => {
    const req = requiredArtifacts(deps, grammars)

    it('includes the tree-sitter wasm + query files the build statically imports', () => {
      expect(req).toContain('resources/tree-sitter-lex.wasm')
      expect(req).toContain('resources/queries/highlights.scm')
      expect(req).toContain('resources/queries/injections.scm')
    })

    it('includes the lexd-lsp binary (platform-suffixed) derived from deps.json dest + binary', () => {
      expect(req).toContain(lspBinary)
    })

    it('expands one parser.wasm + highlights.scm per embedded grammar', () => {
      expect(req).toContain('resources/embedded-grammars/python/parser.wasm')
      expect(req).toContain('resources/embedded-grammars/python/highlights.scm')
      expect(req).toContain('resources/embedded-grammars/rust/parser.wasm')
      expect(req).toContain('resources/embedded-grammars/rust/highlights.scm')
    })

    it('emits forward-slash (POSIX) repo-relative paths on every platform', () => {
      for (const p of req) {
        expect(p).not.toContain('\\')
      }
    })
  })

  describe('findMissing — the fail-fast signal', () => {
    const req = requiredArtifacts(deps, grammars)

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
    // A reader that serves both manifests and an "everything present" probe.
    const readAll = (rel) => (rel === 'deps.json' ? deps : grammars)
    const presentAll = () => true

    it('reports nothing missing when manifests and artifacts are all present', () => {
      expect(computeMissing(readAll, presentAll)).toEqual([])
    })

    it('reports a missing deps.json instead of throwing', () => {
      const readNoDeps = (rel) => (rel === 'deps.json' ? null : grammars)
      const missing = computeMissing(readNoDeps, presentAll)
      expect(missing).toContain('deps.json')
    })

    it('reports a missing embedded-grammars.json instead of throwing', () => {
      const readNoGrammars = (rel) => (rel === 'deps.json' ? deps : null)
      const missing = computeMissing(readNoGrammars, presentAll)
      expect(missing).toContain('resources/embedded-grammars.json')
    })

    it('reports both manifests missing (and does not double-count) when neither reads', () => {
      const readNone = () => null
      const missing = computeMissing(readNone, presentAll)
      expect(missing).toContain('deps.json')
      expect(missing).toContain('resources/embedded-grammars.json')
      // De-duped: embedded-grammars.json is also a tree-sitter extract target,
      // but it must appear exactly once.
      expect(missing.filter((m) => m === 'resources/embedded-grammars.json')).toHaveLength(1)
    })
  })
})
