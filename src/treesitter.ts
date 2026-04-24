/**
 * Renderer-side tree-sitter wrapper for the lex grammar. Parallels
 * vscode/src/treesitter.ts but uses Vite's `?url` loaders to point
 * web-tree-sitter at the bundled WASM artifacts, since the renderer runs
 * under Chromium (not Node) and cannot use `fs.readFileSync` directly.
 *
 * The runtime `tree-sitter.wasm` ships inside the `web-tree-sitter` package
 * and is fingerprinted by Vite. The lex grammar `tree-sitter-lex.wasm` plus
 * the `.scm` queries live in `resources/` and are downloaded by
 * `scripts/download-tree-sitter.sh` at install / build time.
 *
 * Each `initTreeSitter()` call resolves to a `LexTreeSitter` instance or
 * `null` — the module mirrors the vscode adapter's fallback contract
 * (caller can no-op the injection highlighter when tree-sitter is
 * unavailable, e.g. during a dev cycle before the artifacts land).
 */

import { Parser, Language, Query, type Tree, type Node } from 'web-tree-sitter'
import runtimeWasmUrl from 'web-tree-sitter/tree-sitter.wasm?url'
import grammarWasmUrl from '../resources/tree-sitter-lex.wasm?url'
import highlightsQuerySrc from '../resources/queries/highlights.scm?raw'
import injectionsQuerySrc from '../resources/queries/injections.scm?raw'

export type { Tree, Node }

export interface CaptureResult {
  name: string
  startRow: number
  startCol: number
  endRow: number
  endCol: number
  text: string
}

export interface InjectionZone {
  language: string
  startRow: number
  startCol: number
  endRow: number
  endCol: number
  text: string
}

export interface LexTreeSitter {
  parse(text: string): Tree
  queryHighlights(tree: Tree): CaptureResult[]
  queryInjections(tree: Tree): InjectionZone[]
  dispose(): void
}

let initPromise: Promise<LexTreeSitter | null> | null = null

/**
 * Lazy singleton — subsequent callers share the same parser/queries. Also
 * memoises failures: if the WASM load fails once (e.g. the grammar file
 * wasn't downloaded), we don't retry on every editor mount.
 */
export function initTreeSitter(): Promise<LexTreeSitter | null> {
  if (!initPromise) {
    initPromise = loadTreeSitter()
  }
  return initPromise
}

async function loadTreeSitter(): Promise<LexTreeSitter | null> {
  try {
    await Parser.init({
      locateFile: () => runtimeWasmUrl,
    })

    const language = await Language.load(grammarWasmUrl)
    const parser = new Parser()
    parser.setLanguage(language)

    const highlightsQuery = new Query(language, highlightsQuerySrc)

    let injectionsQuery: Query | null = null
    if (injectionsQuerySrc && injectionsQuerySrc.trim().length > 0) {
      try {
        injectionsQuery = new Query(language, injectionsQuerySrc)
      } catch (err) {
        console.warn('[lex] injections query failed to compile:', err)
      }
    }

    return {
      parse(text: string): Tree {
        const tree = parser.parse(text)
        if (!tree) throw new Error('tree-sitter parse returned null')
        return tree
      },

      queryHighlights(tree: Tree): CaptureResult[] {
        const captures = highlightsQuery.captures(tree.rootNode)
        return captures.map((c) => ({
          name: c.name,
          startRow: c.node.startPosition.row,
          startCol: c.node.startPosition.column,
          endRow: c.node.endPosition.row,
          endCol: c.node.endPosition.column,
          text: c.node.text,
        }))
      },

      queryInjections(tree: Tree): InjectionZone[] {
        if (!injectionsQuery) return []

        const captures = injectionsQuery.captures(tree.rootNode)
        const zones: InjectionZone[] = []

        const contentCaptures: Array<{
          node: CaptureResult
          parentId: number
        }> = []
        const langCaptures: Array<{
          lang: string
          parentId: number
        }> = []

        for (const capture of captures) {
          const parentNode = capture.node.parent
          const parentId = parentNode?.id ?? 0

          if (capture.name === 'injection.content') {
            contentCaptures.push({
              node: {
                name: capture.name,
                startRow: capture.node.startPosition.row,
                startCol: capture.node.startPosition.column,
                endRow: capture.node.endPosition.row,
                endCol: capture.node.endPosition.column,
                text: capture.node.text,
              },
              parentId,
            })
          } else if (capture.name === 'injection.language') {
            const raw = capture.node.text.trim()
            const lang = raw.split(/\s+/)[0].toLowerCase()
            langCaptures.push({ lang, parentId })
          }
        }

        const langByParent = new Map<number, string>()
        for (const lc of langCaptures) {
          langByParent.set(lc.parentId, lc.lang)
        }

        for (const cc of contentCaptures) {
          const lang = langByParent.get(cc.parentId)
          if (lang) {
            zones.push({
              language: lang,
              startRow: cc.node.startRow,
              startCol: cc.node.startCol,
              endRow: cc.node.endRow,
              endCol: cc.node.endCol,
              text: cc.node.text,
            })
          }
        }

        return zones
      },

      dispose() {
        parser.delete()
        highlightsQuery.delete()
        injectionsQuery?.delete()
      },
    }
  } catch (err) {
    console.warn('[lex] Failed to initialize tree-sitter:', err)
    return null
  }
}
