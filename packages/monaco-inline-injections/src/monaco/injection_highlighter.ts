/**
 * Monaco host adapter for the host-neutral injection highlighter.
 *
 * Responsibilities:
 *   - Calls the supplied `InjectionZoneProvider` to discover annotated
 *     zones in the document on every (debounced) content change.
 *   - Synthesises an LSP-shaped `SemanticTokens` payload from Monaco's
 *     built-in Monarch tokenizers (`monaco.editor.tokenize`). Languages
 *     without a Monarch tokenizer are silently skipped.
 *   - Translates the core module's `InjectionRange[]` output into Monaco
 *     decorations via `IEditorDecorationsCollection`.
 *
 * Decorations carry an `inlineClassName` keyed by category; the actual
 * colours live in `injection_highlighter.css`.
 */

import * as monaco from 'monaco-editor'
import {
  computeInjectionDecorations,
  DEBOUNCE_MS,
  SEMANTIC_TOKEN_MAP,
  type DecorationCategory,
  type InjectionHostAdapter,
  type InjectionRange,
  type InjectionZone,
  type InjectionZoneProvider,
  type SemanticTokens
} from '../core'
import './injection_highlighter.css'

export interface MonacoInjectionHighlighterApi {
  getInjectionZones(): InjectionZone[]
  getInjectionRanges(): InjectionRange[]
  getRangesByCategory(): ReadonlyMap<DecorationCategory, InjectionRange[]>
  refresh(): Promise<void>
  setEnabled(enabled: boolean): void
  dispose(): void
}

const CATEGORY_CLASS_PREFIX = 'inline-injection'

function classNameFor(category: DecorationCategory): string {
  return `${CATEGORY_CLASS_PREFIX}-${category}`
}

/**
 * Pluggable tokenizer that replaces Monaco's built-in Monarch path. The
 * Monaco fallback is fine for prototyping but inaccurate compared with
 * tree-sitter; hosts that ship a tree-sitter (or other) tokenizer for
 * embedded zones supply it here. Languages absent from
 * `availableLanguages()` are skipped — the host adapter never falls
 * back to Monaco for them.
 */
export interface InjectionTokenizer {
  availableLanguages(): Set<string>
  getSemanticTokens(
    zoneIndex: number,
    content: string,
    langId: string
  ): Promise<SemanticTokens | null>
}

export interface HighlighterOptions {
  /** Toggle from a settings UI. Defaults to true. */
  initialEnabled?: boolean
  /**
   * Language ID the editor's model must report for highlighting to run.
   * When set, content with a different language ID clears decorations.
   * When omitted, all models are highlighted.
   */
  hostLanguageId?: string
  /**
   * Optional tokenizer override. When provided, the highlighter sources
   * `getRegisteredLanguages` from `tokenizer.availableLanguages()` and
   * delegates `getSemanticTokens` to the tokenizer. Omit to fall back to
   * Monaco's built-in Monarch tokenizers (the package's original
   * behaviour).
   */
  tokenizer?: InjectionTokenizer
}

export function createMonacoInjectionHighlighter(
  editor: monaco.editor.IStandaloneCodeEditor,
  zoneProvider: InjectionZoneProvider,
  options: HighlighterOptions = {}
): MonacoInjectionHighlighterApi {
  let enabled = options.initialEnabled ?? true
  const hostLanguageId = options.hostLanguageId
  const tokenizer = options.tokenizer
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
    if (tokenizer) return tokenizer.availableLanguages()
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
    zoneIndex: number,
    content: string,
    langId: string
  ): Promise<SemanticTokens | null> {
    if (tokenizer) {
      return tokenizer.getSemanticTokens(zoneIndex, content, langId)
    }
    await primeLanguage(langId)

    let rawTokens: monaco.Token[][]
    try {
      rawTokens = monaco.editor.tokenize(content, langId)
    } catch {
      return null
    }

    const legend = {
      tokenTypes: Object.keys(SEMANTIC_TOKEN_MAP)
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
        // strip everything from the first dot onwards, since `SEMANTIC_TOKEN_MAP`
        // keys are bare type names like "keyword", "string", "comment", etc.
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

  const hostAdapter: InjectionHostAdapter = {
    getRegisteredLanguages,
    getSemanticTokens: getSemanticTokensForZone
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
    if (!enabled || (hostLanguageId !== undefined && model.getLanguageId() !== hostLanguageId)) {
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
      zones = zoneProvider.getZones(text)
    } catch (err) {
      console.warn('[inline-injections] zone provider failed:', err)
      clearDecorations()
      return
    }
    currentZones = zones

    const ranges = await computeInjectionDecorations(zones, hostAdapter)

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
        // Core module emits zero-based line/col; Monaco is one-based.
        newDecorations.push({
          range: new monaco.Range(r.startLine + 1, r.startCol + 1, r.endLine + 1, r.endCol + 1),
          options: {
            inlineClassName: className,
            // Ensure we render alongside (not over) the LSP semantic
            // tokens — `inlineClassName` layers over the existing syntax
            // colouring, it does not replace it.
            shouldFillLineOnLineBreak: false
          }
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
    }, DEBOUNCE_MS)
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
    dispose
  }
}
