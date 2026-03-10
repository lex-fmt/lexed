/**
 * Client-side spellcheck service using nspell (Hunspell-compatible).
 *
 * Runs entirely in the renderer process. Dictionaries are loaded from
 * the main process via IPC (bundled as extraResources).
 */
import nspell from 'nspell'
import type NSpell from 'nspell'
import * as monaco from 'monaco-editor'
import { extractCheckableWords } from './word-extraction'

const MARKER_OWNER = 'lex-spell'
const DEBOUNCE_MS = 300
const MAX_SUGGESTIONS = 4

interface DictionaryData {
  aff: string
  dic: string
}

export class SpellcheckService {
  private checker: NSpell | null = null
  private language: string = ''
  private enabled: boolean = true
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private codeActionDisposable: monaco.IDisposable | null = null
  private loadGeneration: number = 0

  async setLanguage(language: string): Promise<void> {
    if (language === this.language && this.checker) return

    // Increment generation to cancel any in-flight load
    const generation = ++this.loadGeneration
    this.language = language
    this.checker = null

    console.log(`[Spellcheck] Loading dictionary for ${language}...`)
    const data = await this.loadDictionary(language)

    // If another setLanguage was called while we were loading, abort
    if (this.loadGeneration !== generation) {
      console.log(`[Spellcheck] Discarding stale load for ${language}`)
      return
    }

    if (!data) {
      console.warn(`[Spellcheck] No dictionary data for ${language}`)
      return
    }

    console.log(
      `[Spellcheck] Creating checker for ${language} (aff: ${data.aff.length} bytes, dic: ${data.dic.length} bytes)`
    )
    this.checker = nspell(data.aff, data.dic)

    // Load custom words
    const customWords = await this.loadCustomWords()
    if (this.loadGeneration !== generation) return

    for (const word of customWords) {
      this.checker.add(word)
    }
    console.log(
      `[Spellcheck] Dictionary loaded for ${language} (${customWords.length} custom words)`
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
    return this.enabled && this.checker !== null
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
    if (!this.checker) {
      // No dictionary loaded yet — clear stale markers from previous language
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
    if (!this.checker) return true
    // Skip single characters, numbers, and words with special chars
    if (word.length <= 1) return true
    if (/^\d+$/.test(word)) return true
    if (/[_@#$%^&*]/.test(word)) return true
    return this.checker.correct(word)
  }

  /**
   * Get spelling suggestions for a misspelled word.
   */
  suggest(word: string): string[] {
    if (!this.checker) return []
    return this.checker.suggest(word).slice(0, MAX_SUGGESTIONS)
  }

  /**
   * Add a word to the custom dictionary. Persists via IPC.
   */
  async addToDictionary(word: string): Promise<void> {
    if (this.checker) {
      this.checker.add(word)
    }
    await window.ipcRenderer.invoke('spellcheck-add-to-dictionary', word)
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

  private async loadDictionary(language: string): Promise<DictionaryData | null> {
    try {
      const data = (await window.ipcRenderer.invoke('spellcheck-load-dictionary', language)) as
        | DictionaryData
        | { error: string }
      if ('error' in data) {
        console.warn(`[Spellcheck] Failed to load dictionary for ${language}:`, data.error)
        return null
      }
      return data
    } catch (err) {
      console.warn(`[Spellcheck] Failed to load dictionary for ${language}:`, err)
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
