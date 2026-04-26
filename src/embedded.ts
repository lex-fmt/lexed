/**
 * Renderer-side tree-sitter tokenizer for the languages bundled in
 * `resources/embedded-grammars/<lang>/`. Mirrors `vscode/src/embedded.ts`
 * but reads its WASM/queries through Vite's `import.meta.glob` instead
 * of `fs.readFileSync`, since this module runs in the renderer process.
 *
 * The tokenizer slots into `@lex/monaco-inline-injections` via the
 * highlighter's `tokenizer` option: it reports the available languages
 * from the bundle, and converts each tree-sitter `highlights.scm`
 * capture into an LSP-shaped `SemanticTokens` payload that the package's
 * existing `mapTokensToDecorations` decoder can consume unchanged.
 *
 * Languages outside the bundle aren't tokenized — the host adapter
 * skips zones whose annotation doesn't resolve. That's the agreed
 * contract: Lex doesn't gatekeep formats, but only the languages the
 * editor actually bundled get rendered.
 */

import { Parser, Language, Query } from 'web-tree-sitter'
import type { SemanticTokens } from '@lex/monaco-inline-injections'

// Vite scans these globs at build time. The download script populates
// `resources/embedded-grammars/<lang>/{parser.wasm,highlights.scm}`
// before `vite build` runs, so the resolved set matches the manifest
// shipped in `tree-sitter-lex/shared/embedded-grammars.json`.
const wasmUrls = import.meta.glob<string>('../resources/embedded-grammars/*/parser.wasm', {
  eager: true,
  query: '?url',
  import: 'default',
})
const highlightSources = import.meta.glob<string>(
  '../resources/embedded-grammars/*/highlights.scm',
  { eager: true, query: '?raw', import: 'default' }
)

interface LangAssets {
  wasmUrl: string
  queryStr: string
}

interface LoadedLanguage {
  parser: Parser
  query: Query
}

export interface EmbeddedTokenizer {
  availableLanguages(): Set<string>
  getSemanticTokens(
    zoneIndex: number,
    content: string,
    langId: string
  ): Promise<SemanticTokens | null>
  dispose(): void
}

// Mirror of the SEMANTIC_TOKEN_MAP keys in @lex/monaco-inline-injections —
// the tokenizer encodes payloads against this legend so the existing
// decoder picks each capture up by base name (split on first '.').
const LEGEND_TYPES = [
  'keyword',
  'modifier',
  'function',
  'method',
  'macro',
  'decorator',
  'string',
  'regexp',
  'number',
  'comment',
  'type',
  'class',
  'enum',
  'interface',
  'struct',
  'typeParameter',
  'namespace',
  'operator',
] as const

function langFromPath(p: string): string | null {
  const m = p.match(/\/embedded-grammars\/([^/]+)\//)
  return m ? m[1] : null
}

function buildIndex(): Map<string, LangAssets> {
  const partial = new Map<string, Partial<LangAssets>>()
  for (const [p, url] of Object.entries(wasmUrls)) {
    const lang = langFromPath(p)
    if (!lang) continue
    const e = partial.get(lang) ?? {}
    e.wasmUrl = url
    partial.set(lang, e)
  }
  for (const [p, src] of Object.entries(highlightSources)) {
    const lang = langFromPath(p)
    if (!lang) continue
    const e = partial.get(lang) ?? {}
    e.queryStr = src
    partial.set(lang, e)
  }
  const complete = new Map<string, LangAssets>()
  for (const [lang, e] of partial) {
    if (e.wasmUrl && e.queryStr) {
      complete.set(lang, { wasmUrl: e.wasmUrl, queryStr: e.queryStr })
    }
  }
  return complete
}

export function createEmbeddedTokenizer(): EmbeddedTokenizer {
  const index = buildIndex()
  const loaded = new Map<string, LoadedLanguage>()
  const inflight = new Map<string, Promise<LoadedLanguage | null>>()
  const failed = new Set<string>()

  const typeIndex = new Map<string, number>()
  for (let i = 0; i < LEGEND_TYPES.length; i++) {
    typeIndex.set(LEGEND_TYPES[i], i)
  }
  const legend = { tokenTypes: LEGEND_TYPES as readonly string[] }

  async function load(langId: string): Promise<LoadedLanguage | null> {
    const cached = loaded.get(langId)
    if (cached) return cached
    if (failed.has(langId)) return null
    const existing = inflight.get(langId)
    if (existing) return existing

    const assets = index.get(langId)
    if (!assets) {
      failed.add(langId)
      return null
    }

    const promise = (async (): Promise<LoadedLanguage | null> => {
      try {
        const language = await Language.load(assets.wasmUrl)
        const parser = new Parser()
        parser.setLanguage(language)
        const query = new Query(language, assets.queryStr)
        const result: LoadedLanguage = { parser, query }
        loaded.set(langId, result)
        return result
      } catch (err) {
        console.warn(`[lex] embedded tokenizer: load failed for ${langId}:`, err)
        failed.add(langId)
        return null
      } finally {
        inflight.delete(langId)
      }
    })()
    inflight.set(langId, promise)
    return promise
  }

  return {
    availableLanguages: () => new Set(index.keys()),

    async getSemanticTokens(_zoneIndex, content, langId) {
      const lang = await load(langId)
      if (!lang) return null

      let tree
      try {
        tree = lang.parser.parse(content)
      } catch {
        return null
      }
      if (!tree) return null

      try {
        const captures = lang.query.captures(tree.rootNode)
        // Sort by position so the LSP delta encoding stays monotonic.
        captures.sort((a, b) => {
          const ar = a.node.startPosition.row
          const br = b.node.startPosition.row
          if (ar !== br) return ar - br
          return a.node.startPosition.column - b.node.startPosition.column
        })

        const data: number[] = []
        let prevLine = 0
        let prevStart = 0

        for (const cap of captures) {
          // Tree-sitter capture names look like `keyword`, `string.special`,
          // `function.builtin` — keep just the base, since the package's
          // SEMANTIC_TOKEN_MAP keys are bare type names.
          const baseType = cap.name.split('.')[0]
          const idx = typeIndex.get(baseType)
          if (idx === undefined) continue

          const startLine = cap.node.startPosition.row
          const startCol = cap.node.startPosition.column
          const endLine = cap.node.endPosition.row
          const endCol = cap.node.endPosition.column

          // mapTokensToDecorations encodes one decoration per LSP token using
          // (startChar, length) on a single line. Multi-line captures (rare
          // — usually multi-line strings or comments) are skipped here; their
          // outer brackets are typically captured separately.
          if (startLine !== endLine) continue
          const length = endCol - startCol
          if (length <= 0) continue

          const deltaLine = startLine - prevLine
          const deltaStart = deltaLine === 0 ? startCol - prevStart : startCol
          data.push(deltaLine, deltaStart, length, idx, 0)
          prevLine = startLine
          prevStart = startCol
        }

        if (data.length === 0) return null
        return { legend, data: new Uint32Array(data) }
      } finally {
        tree.delete()
      }
    },

    dispose() {
      for (const e of loaded.values()) {
        e.parser.delete()
        e.query.delete()
      }
      loaded.clear()
      inflight.clear()
      failed.clear()
    },
  }
}
