import { describe, it, expect } from 'vitest'
import { requiredArtifacts, findMissing } from './check-deps.mjs'

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

describe('check-deps preflight', () => {
  describe('requiredArtifacts', () => {
    const req = requiredArtifacts(deps, grammars)

    it('includes the tree-sitter wasm + query files the build statically imports', () => {
      expect(req).toContain('resources/tree-sitter-lex.wasm')
      expect(req).toContain('resources/queries/highlights.scm')
      expect(req).toContain('resources/queries/injections.scm')
    })

    it('includes the lexd-lsp binary derived from deps.json dest + binary', () => {
      expect(req).toContain('resources/lexd-lsp')
    })

    it('expands one parser.wasm + highlights.scm per embedded grammar', () => {
      expect(req).toContain('resources/embedded-grammars/python/parser.wasm')
      expect(req).toContain('resources/embedded-grammars/python/highlights.scm')
      expect(req).toContain('resources/embedded-grammars/rust/parser.wasm')
      expect(req).toContain('resources/embedded-grammars/rust/highlights.scm')
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
})
