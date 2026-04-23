/**
 * Client-side spellcheck service using cspell-trie-lib.
 *
 * Runs entirely in the renderer process. Per-language tries are
 * precompiled offline (see scripts/generate-tries.mjs) and shipped as
 * `dictionaries/<lang>.trie.gz`; the main process decompresses them and
 * hands the text to `importTrie`. Startup cost is 50–320ms — well under
 * a frame on English and under a third of a second for morphologically
 * rich locales like pt_BR, where nspell used to take minutes.
 */
import { importTrie, Trie } from 'cspell-trie-lib'
import * as monaco from 'monaco-editor'
import { extractCheckableWords } from './word-extraction'
import { caseVariants } from './case-variants'

const MARKER_OWNER = 'lex-spell'
const DEBOUNCE_MS = 300
const MAX_SUGGESTIONS = 4

interface TrieData {
  text: string
}

export class SpellcheckService {
  private trie: Trie | null = null
  // Words the user added via "Add to dictionary" (or any case variants
  // we fanned out). The trie is immutable once parsed, so runtime
  // additions live here and we consult both during `isCorrect`.
  private customWords: Set<string> = new Set()
  private language: string = ''
  private enabled: boolean = true
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private codeActionDisposable: monaco.IDisposable | null = null
  private loadGeneration: number = 0

  async setLanguage(language: string): Promise<void> {
    if (language === this.language && this.trie) return

    // Increment generation to cancel any in-flight load
    const generation = ++this.loadGeneration
    this.language = language
    this.trie = null
    this.customWords = new Set()

    console.log(`[Spellcheck] Loading trie for ${language}…`)
    const data = await this.loadTrie(language)

    // If another setLanguage was called while we were loading, abort
    if (this.loadGeneration !== generation) {
      console.log(`[Spellcheck] Discarding stale load for ${language}`)
      return
    }

    if (!data) {
      console.warn(`[Spellcheck] No trie data for ${language}`)
      return
    }

    const t0 = performance.now()
    this.trie = new Trie(importTrie(data.text))
    const parseMs = performance.now() - t0

    // Custom words (user additions via "Add to dictionary")
    const customWords = await this.loadCustomWords()
    if (this.loadGeneration !== generation) return
    this.customWords = new Set(customWords)

    console.log(
      `[Spellcheck] Trie ready for ${language} (parsed in ${parseMs.toFixed(0)}ms, ${this.customWords.size} custom words)`
    )
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.clearAllMarkers()
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  isReady(): boolean {
    return this.enabled && this.trie !== null
  }

  /**
   * The language the trie is currently loaded for (only meaningful
   * while `isReady()` is true). Exposed so tests can wait for a
   * language switch to land without relying on marker contents, which
   * are ambiguous across languages for the same document.
   */
  currentLanguage(): string | null {
    return this.trie !== null ? this.language : null
  }

  /**
   * Schedule a spellcheck for the given model. Debounced to avoid
   * checking on every keystroke.
   */
  scheduleCheck(model: monaco.editor.ITextModel): void {
    if (!this.enabled) return

    const uri = model.uri.toString()
    const existing = this.debounceTimers.get(uri)
    if (existing) clearTimeout(existing)

    this.debounceTimers.set(
      uri,
      setTimeout(() => {
        this.debounceTimers.delete(uri)
        this.checkModel(model)
      }, DEBOUNCE_MS)
    )
  }

  /**
   * Run spellcheck immediately on a model.
   */
  checkModel(model: monaco.editor.ITextModel): void {
    if (!this.enabled || model.isDisposed()) return
    if (!this.trie) {
      // No trie loaded yet — clear stale markers from previous language
      monaco.editor.setModelMarkers(model, MARKER_OWNER, [])
      return
    }

    const text = model.getValue()
    const words = extractCheckableWords(text)
    const markers: monaco.editor.IMarkerData[] = []

    for (const word of words) {
      if (!this.isCorrect(word.text)) {
        markers.push({
          severity: monaco.MarkerSeverity.Info,
          message: `Unknown word: ${word.text}`,
          startLineNumber: word.startLine,
          startColumn: word.startColumn,
          endLineNumber: word.endLine,
          endColumn: word.endColumn,
          source: MARKER_OWNER,
        })
      }
    }

    monaco.editor.setModelMarkers(model, MARKER_OWNER, markers)
  }

  /**
   * Check a single word.
   */
  isCorrect(word: string): boolean {
    if (!this.trie) return true
    // Skip single characters, numbers, and words with special chars
    if (word.length <= 1) return true
    if (/^\d+$/.test(word)) return true
    if (/[_@#$%^&*]/.test(word)) return true
    return this.trie.has(word) || this.customWords.has(word)
  }

  /**
   * Get spelling suggestions for a misspelled word.
   */
  suggest(word: string): string[] {
    if (!this.trie) return []
    return this.trie.suggest(word, { numSuggestions: MAX_SUGGESTIONS })
  }

  /**
   * Add a word to the custom dictionary. Persists via IPC.
   *
   * For plain lowercase or Title-case input both forms are added, so
   * the user doesn't have to approve "potato" and "Potato" separately.
   * Oddly-cased words (ALL CAPS acronyms, camelCase, iPhone…) are
   * stored verbatim.
   */
  async addToDictionary(word: string): Promise<void> {
    const variants = caseVariants(word)
    for (const v of variants) this.customWords.add(v)
    for (const v of variants) {
      await window.ipcRenderer.invoke('spellcheck-add-to-dictionary', v)
    }
  }

  /**
   * Register Monaco code action provider for spelling suggestions.
   */
  registerCodeActions(): void {
    if (this.codeActionDisposable) return

    this.codeActionDisposable = monaco.languages.registerCodeActionProvider('lex', {
      provideCodeActions: (model, _range, context) => {
        const actions: monaco.languages.CodeAction[] = []

        for (const marker of context.markers) {
          if (marker.source !== MARKER_OWNER) continue
          const word = marker.message.replace('Unknown word: ', '')

          // Spelling suggestions
          const suggestions = this.suggest(word)
          for (const suggestion of suggestions) {
            actions.push({
              title: suggestion,
              kind: 'quickfix',
              diagnostics: [marker],
              isPreferred: false,
              edit: {
                edits: [
                  {
                    resource: model.uri,
                    textEdit: {
                      range: {
                        startLineNumber: marker.startLineNumber,
                        startColumn: marker.startColumn,
                        endLineNumber: marker.endLineNumber,
                        endColumn: marker.endColumn,
                      },
                      text: suggestion,
                    },
                    versionId: undefined,
                  },
                ],
              },
            })
          }

          // Add to dictionary action
          actions.push({
            title: `Add '${word}' to dictionary`,
            kind: 'quickfix',
            diagnostics: [marker],
            command: {
              id: 'lexed.spellcheck.addToDictionary',
              title: 'Add to dictionary',
              arguments: [word, model.uri.toString()],
            },
          })
        }

        return { actions, dispose: () => {} }
      },
    })

    // Register the "add to dictionary" command
    monaco.editor.registerCommand(
      'lexed.spellcheck.addToDictionary',
      async (_accessor, word: string, uriString: string) => {
        await this.addToDictionary(word)
        // Re-check the model to clear the marker
        const uri = monaco.Uri.parse(uriString)
        const model = monaco.editor.getModel(uri)
        if (model) this.checkModel(model)
      }
    )
  }

  /**
   * Clear all spellcheck markers from all models.
   */
  clearAllMarkers(): void {
    for (const model of monaco.editor.getModels()) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, [])
    }
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    this.codeActionDisposable?.dispose()
    this.codeActionDisposable = null
    this.clearAllMarkers()
  }

  private async loadTrie(language: string): Promise<TrieData | null> {
    try {
      const data = (await window.ipcRenderer.invoke('spellcheck-load-trie', language)) as
        | TrieData
        | { error: string }
      if ('error' in data) {
        console.warn(`[Spellcheck] Failed to load trie for ${language}:`, data.error)
        return null
      }
      return data
    } catch (err) {
      console.warn(`[Spellcheck] Failed to load trie for ${language}:`, err)
      return null
    }
  }

  private async loadCustomWords(): Promise<string[]> {
    try {
      return (await window.ipcRenderer.invoke('spellcheck-load-custom-words')) as string[]
    } catch {
      return []
    }
  }
}

/** Singleton instance. */
export const spellcheckService = new SpellcheckService()
