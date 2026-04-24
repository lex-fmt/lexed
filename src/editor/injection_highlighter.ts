/**
 * Monaco host adapter for the shared injection highlighter.
 *
 * Responsibilities (matches vscode/src/injections.ts):
 *   - Owns tree-sitter parsing (`ts.parse` + `ts.queryInjections`).
 *   - Debounced re-highlight on content change (250 ms, same as vscode).
 *   - Initial highlight on install, and re-highlight on language change.
 *   - Translates the shared module's `InjectionRange[]` output into Monaco
 *     decorations via `IEditorDecorationsCollection`.
 *
 * Differences from the vscode adapter:
 *   - Monaco has no equivalent of `vscode.commands.executeCommand(
 *     'vscode.provideDocumentSemanticTokens')` for arbitrary languages, so we
 *     synthesise an LSP-shaped `SemanticTokens` payload from Monaco's built-in
 *     Monarch tokenizers (`monaco.editor.tokenize`). Languages without a
 *     Monarch tokenizer in the `monaco-editor` bundle are silently skipped,
 *     matching the vscode behaviour of "no provider → no highlighting".
 *   - Decorations carry an `inlineClassName` keyed by category; the actual
 *     colours live in `src/editor/injection_highlighter.css`.
 *   - Registered-language cache is refreshed by scanning `monaco.languages.
 *     getLanguages()` — that set is stable for the editor lifetime so we
 *     only fetch it once (no 30-second expiry like vscode, since newly
 *     registered languages in a Monaco renderer are a developer event, not
 *     a runtime one).
 */

import * as monaco from 'monaco-editor'
import { injections } from '@lex/shared'
import type { LexTreeSitter } from '../treesitter'
import './injection_highlighter.css'

type DecorationCategory = injections.DecorationCategory
type InjectionZone = injections.InjectionZone
type InjectionRange = injections.InjectionRange

export interface MonacoInjectionHighlighterApi {
  getInjectionZones(): InjectionZone[]
  getInjectionRanges(): InjectionRange[]
  getRangesByCategory(): ReadonlyMap<DecorationCategory, InjectionRange[]>
  refresh(): Promise<void>
  setEnabled(enabled: boolean): void
  dispose(): void
}

const CATEGORY_CLASS_PREFIX = 'lex-injection'

function classNameFor(category: DecorationCategory): string {
  return `${CATEGORY_CLASS_PREFIX}-${category}`
}

interface HighlighterOptions {
  /** Toggle from the settings UI. Defaults to true. */
  initialEnabled?: boolean
}

export function createMonacoInjectionHighlighter(
  editor: monaco.editor.IStandaloneCodeEditor,
  ts: LexTreeSitter,
  options: HighlighterOptions = {}
): MonacoInjectionHighlighterApi {
  let enabled = options.initialEnabled ?? true
  let disposed = false

  const decorationsCollection = editor.createDecorationsCollection()
  const disposables: monaco.IDisposable[] = []
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let currentZones: InjectionZone[] = []
  let lastRanges: ReadonlyMap<DecorationCategory, InjectionRange[]> = new Map()

  // Monaco basic-language registration is synchronous, but tokenization
  // is lazy-loaded on first request. Prime the loader per language the
  // first time we see it so subsequent `tokenize()` calls return real
  // tokens instead of null-tokens.
  const primedLanguages = new Set<string>()

  let cachedLanguages: Set<string> | null = null

  async function getRegisteredLanguages(): Promise<Set<string>> {
    if (!cachedLanguages) {
      cachedLanguages = new Set(monaco.languages.getLanguages().map((l) => l.id))
    }
    return cachedLanguages
  }

  async function primeLanguage(langId: string): Promise<void> {
    if (primedLanguages.has(langId)) return
    try {
      // `monaco.editor.colorize` awaits the lazy tokenizer loader. Once
      // this resolves, subsequent `monaco.editor.tokenize(...)` calls for
      // the same language return real tokens instead of the null-state
      // fallback.
      await monaco.editor.colorize('', langId, { tabSize: 2 })
    } catch {
      // If colorize throws the language is unusable — mark it primed so
      // we don't retry on every zone, and the null-tokens path below
      // will silently skip it.
    }
    primedLanguages.add(langId)
  }

  async function getSemanticTokensForZone(
    _zoneIndex: number,
    content: string,
    langId: string
  ): Promise<injections.SemanticTokens | null> {
    await primeLanguage(langId)

    let rawTokens: monaco.Token[][]
    try {
      rawTokens = monaco.editor.tokenize(content, langId)
    } catch {
      return null
    }

    // Build the LSP-shaped legend/data pair. We emit a tiny legend (the
    // seven shared categories) and lean on the shared module's
    // `SEMANTIC_TOKEN_MAP` to route each token type.
    const legend = {
      tokenTypes: Object.keys(injections.SEMANTIC_TOKEN_MAP),
    }
    const typeIndex = new Map<string, number>()
    for (let i = 0; i < legend.tokenTypes.length; i++) {
      typeIndex.set(legend.tokenTypes[i], i)
    }

    const lines = content.split(/\r\n|\r|\n/)
    const data: number[] = []
    let prevLine = 0
    let prevStart = 0
    let emittedAny = false

    for (let lineIdx = 0; lineIdx < rawTokens.length; lineIdx++) {
      const tokens = rawTokens[lineIdx]
      if (!tokens || tokens.length === 0) continue

      const lineText = lines[lineIdx] ?? ''

      for (let t = 0; t < tokens.length; t++) {
        const token = tokens[t]
        const nextOffset = t + 1 < tokens.length ? tokens[t + 1].offset : lineText.length
        const length = nextOffset - token.offset
        if (length <= 0) continue

        // Monaco token types look like "keyword.python" or "string.quoted.python" —
        // strip everything from the first dot onwards, since our shared
        // `SEMANTIC_TOKEN_MAP` keys are bare type names like "keyword",
        // "string", "comment", etc.
        const baseType = token.type.split('.')[0]
        if (!baseType) continue

        const idx = typeIndex.get(baseType)
        if (idx === undefined) continue

        const deltaLine = lineIdx - prevLine
        const deltaStart = deltaLine === 0 ? token.offset - prevStart : token.offset
        data.push(deltaLine, deltaStart, length, idx, 0)
        prevLine = lineIdx
        prevStart = token.offset
        emittedAny = true
      }
    }

    if (!emittedAny) return null
    return { legend, data: new Uint32Array(data) }
  }

  const hostAdapter: injections.InjectionHostAdapter = {
    getRegisteredLanguages,
    getSemanticTokens: getSemanticTokensForZone,
  }

  function clearDecorations(): void {
    decorationsCollection.clear()
    currentZones = []
    lastRanges = new Map()
  }

  async function highlight(): Promise<void> {
    if (disposed) return
    const model = editor.getModel()
    if (!model || model.isDisposed()) {
      clearDecorations()
      return
    }
    if (!enabled || model.getLanguageId() !== 'lex') {
      clearDecorations()
      return
    }

    // Capture the model version before the async work so we can detect
    // an overlapping `highlight()` that started more recently and should
    // win. Without this, an older pass can resolve after a newer one and
    // overwrite decorations with stale ranges for the same model.
    const versionBeforeParse = model.getVersionId()

    const text = model.getValue()
    let zones: InjectionZone[]
    try {
      const tree = ts.parse(text)
      zones = ts.queryInjections(tree)
      tree.delete()
    } catch (err) {
      console.warn('[lex] tree-sitter parse failed:', err)
      clearDecorations()
      return
    }
    currentZones = zones

    const ranges = await injections.computeInjectionDecorations(zones, hostAdapter)

    // Guard against rapid-fire changes: if the model has been swapped or
    // the highlighter disposed while we were awaiting, drop the result.
    // Also drop if a newer highlight pass started after us (versionId
    // advanced while we were awaiting getSemanticTokens).
    if (disposed) return
    if (editor.getModel() !== model || model.isDisposed()) return
    if (model.getVersionId() !== versionBeforeParse) return

    lastRanges = ranges

    const newDecorations: monaco.editor.IModelDeltaDecoration[] = []
    for (const [category, rs] of ranges) {
      if (rs.length === 0) continue
      const className = classNameFor(category)
      for (const r of rs) {
        // Shared module emits zero-based line/col; Monaco is one-based.
        newDecorations.push({
          range: new monaco.Range(r.startLine + 1, r.startCol + 1, r.endLine + 1, r.endCol + 1),
          options: {
            inlineClassName: className,
            // Ensure we render alongside (not over) the LSP semantic
            // tokens — `inlineClassName` layers over the existing syntax
            // colouring, it does not replace it.
            shouldFillLineOnLineBreak: false,
          },
        })
      }
    }
    decorationsCollection.set(newDecorations)
  }

  function scheduleHighlight(): void {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      void highlight()
    }, injections.DEBOUNCE_MS)
  }

  // Watch the current model for content + language changes.
  let modelListeners: monaco.IDisposable[] = []
  function attachModelListeners(model: monaco.editor.ITextModel): void {
    for (const d of modelListeners) d.dispose()
    modelListeners = []
    modelListeners.push(model.onDidChangeContent(() => scheduleHighlight()))
    modelListeners.push(model.onDidChangeLanguage(() => void highlight()))
    modelListeners.push(model.onWillDispose(() => clearDecorations()))
  }

  const currentModel = editor.getModel()
  if (currentModel) attachModelListeners(currentModel)

  disposables.push(
    editor.onDidChangeModel(() => {
      clearDecorations()
      const nextModel = editor.getModel()
      if (nextModel) {
        attachModelListeners(nextModel)
        void highlight()
      }
    })
  )

  disposables.push(
    editor.onDidDispose(() => {
      dispose()
    })
  )

  // Initial highlight (fire-and-forget — the caller doesn't await).
  void highlight()

  function dispose(): void {
    if (disposed) return
    disposed = true
    if (debounceTimer) clearTimeout(debounceTimer)
    decorationsCollection.clear()
    for (const d of modelListeners) d.dispose()
    modelListeners = []
    for (const d of disposables) d.dispose()
  }

  return {
    getInjectionZones: () => currentZones,
    getInjectionRanges: () => {
      const all: InjectionRange[] = []
      for (const [, rs] of lastRanges) {
        for (const r of rs) all.push(r)
      }
      return all
    },
    getRangesByCategory: () => lastRanges,
    refresh: () => highlight(),
    setEnabled(next: boolean) {
      if (enabled === next) return
      enabled = next
      void highlight()
    },
    dispose,
  }
}
