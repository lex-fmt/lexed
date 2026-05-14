import { useEffect } from 'react'
import * as monaco from 'monaco-editor'
import type { EditorPaneHandle } from '@/components/EditorPane'
import type { PaneState } from '@/panes/types'
import { spellcheckService } from '@/spellcheck/service'
import { lspClient, type TrustRequestParams } from '@lex-fmt/lex-buffer'
import { trustPromptCoordinator } from '@/lsp/trustPromptCoordinator'

type FormattingRequestPayload = {
  type: 'document' | 'range'
  params: unknown
}

let lastFormattingRequest: FormattingRequestPayload | null = null

interface UseLexTestBridgeOptions {
  activePaneId: string | null
  paneHandles: React.MutableRefObject<Map<string, EditorPaneHandle | null>>
  panesRef: React.MutableRefObject<PaneState[]>
  panes: PaneState[]
  openFileInPane: (paneId: string, path: string) => void
  setRootPath: (path: string | undefined) => void
}

export function useLexTestBridge({
  activePaneId,
  paneHandles,
  panesRef,
  panes,
  openFileInPane,
  setRootPath,
}: UseLexTestBridgeOptions) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.ipcRenderer?.loadTestFixture) return

    const waitForPaneFile = async (paneId: string, filePath: string, timeoutMs = 5000) => {
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        const pane = panesRef.current.find((p) => p.id === paneId)
        if (pane?.currentFile === filePath) {
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error(`Timed out opening fixture ${filePath}`)
    }

    const getActiveEditorInstance = () => {
      const target = activePaneId ?? panesRef.current[0]?.id ?? null
      if (!target) {
        return null
      }
      return paneHandles.current.get(target)?.getEditor() ?? null
    }

    const api = {
      openFixture: async (fixtureName: string, targetPaneId?: string | null) => {
        const fixture = await window.ipcRenderer.loadTestFixture(fixtureName)
        const target = targetPaneId ?? activePaneId ?? panes[0]?.id ?? null
        if (!target) {
          throw new Error('No pane available for fixture')
        }
        openFileInPane(target, fixture.path)
        await waitForPaneFile(target, fixture.path)
        return fixture
      },
      readFixture: (fixtureName: string) => window.ipcRenderer.loadTestFixture(fixtureName),
      getActiveEditorValue: () => getActiveEditorInstance()?.getValue() ?? '',
      setActiveEditorValue: (value: string) => {
        const editorInstance = getActiveEditorInstance()
        if (!editorInstance) {
          return false
        }
        editorInstance.setValue(value)
        return true
      },
      focusEditor: () => {
        const editorInstance = getActiveEditorInstance()
        editorInstance?.focus()
        return Boolean(editorInstance)
      },
      triggerSuggest: () => {
        const editorInstance = getActiveEditorInstance()
        if (!editorInstance) {
          return false
        }
        editorInstance.trigger('lex-test', 'editor.action.triggerSuggest', {})
        return true
      },
      triggerMockDiagnostics: () => {
        const target = activePaneId ?? panesRef.current[0]?.id ?? null
        if (!target) {
          return false
        }
        const editorInstance = paneHandles.current.get(target)?.getEditor()
        const model = editorInstance?.getModel?.()
        if (!model) {
          return false
        }
        const lastColumn = model.getLineLength(1) + 1
        monaco.editor.setModelMarkers(model, 'lex-test', [
          {
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: lastColumn,
            message: 'Mock diagnostic for testing',
            source: 'lex-test',
          },
        ])
        return true
      },
      notifyFormattingRequest: (payload: FormattingRequestPayload) => {
        lastFormattingRequest = payload
      },
      getLastFormattingRequest: () => lastFormattingRequest,
      resetFormattingRequest: () => {
        lastFormattingRequest = null
      },
      // Expose markers for testing diagnostics via API
      getMarkers: () => {
        const target = activePaneId ?? panesRef.current[0]?.id ?? null
        if (!target) return []
        const editorInstance = paneHandles.current.get(target)?.getEditor()
        const model = editorInstance?.getModel?.()
        if (!model) return []
        return monaco.editor.getModelMarkers({ resource: model.uri })
      },
      isLspReady: () => Boolean(window.__e2e.ready.lsp),
      isSpellcheckReady: () => spellcheckService.isReady(),
      spellcheckLanguage: () => spellcheckService.currentLanguage(),
      recheckSpelling: () => {
        const target = activePaneId ?? panesRef.current[0]?.id ?? null
        if (!target) return false
        const editorInstance = paneHandles.current.get(target)?.getEditor()
        const model = editorInstance?.getModel?.()
        if (!model) return false
        spellcheckService.checkModel(model)
        return true
      },
      setCursor: (line: number, col: number) => {
        const editorInstance = getActiveEditorInstance()
        if (!editorInstance) return false
        editorInstance.setPosition({ lineNumber: line, column: col })
        // Also reveal the position to be safe
        editorInstance.revealPosition({ lineNumber: line, column: col })
        return true
      },
      getCursor: () => {
        const editorInstance = getActiveEditorInstance()
        const pos = editorInstance?.getPosition()
        if (!pos) return null
        return { line: pos.lineNumber, column: pos.column }
      },
      getLineContent: (line: number) => {
        const editorInstance = getActiveEditorInstance()
        const model = editorInstance?.getModel?.()
        if (!model) return null
        if (line < 1 || line > model.getLineCount()) return null
        return model.getLineContent(line)
      },
      openFolder: async (folderPath: string) => {
        setRootPath(folderPath)
        await window.ipcRenderer.setLastFolder(folderPath)
      },

      // Trust-prompt e2e helpers: inject a `lex/trustRequest` directly
      // into the coordinator so e2e tests can render the modal,
      // observe its content, and click Trust/Deny without setting up
      // a real lexd-lsp + workspace fixture. The full LSP-fires-
      // request path is exercised in lex-fmt/vscode#68 against a
      // real lexd-lsp v0.11.0 binary.
      //
      // Exposure note: this method follows the same gating as the
      // rest of the bridge (gated only on `loadTestFixture` being
      // present in the preload, which is unconditional today). The
      // bridge already exposes other test-only hooks
      // (triggerMockDiagnostics, setActiveEditorValue, etc.) under
      // the same gate, so adding env-flag gating just for this
      // method would be inconsistent. Tightening the whole bridge
      // behind an explicit E2E flag is a separate refactor; tracked
      // implicitly with the rest of the test-bridge surface.
      injectTrustRequest: async (params: TrustRequestParams) => {
        const response = await trustPromptCoordinator.request(params)
        return response
      },

      // Raw LSP request helpers — mainly for e2e tests that want to
      // verify a provider is wired end-to-end without depending on
      // Monaco's internal provider registries.
      requestFoldingRanges: async () => {
        const editorInstance = getActiveEditorInstance()
        const model = editorInstance?.getModel?.()
        if (!model) return null
        return lspClient.sendRequest('textDocument/foldingRange', {
          textDocument: { uri: model.uri.toString() },
        })
      },
      requestDocumentLinks: async () => {
        const editorInstance = getActiveEditorInstance()
        const model = editorInstance?.getModel?.()
        if (!model) return null
        return lspClient.sendRequest('textDocument/documentLink', {
          textDocument: { uri: model.uri.toString() },
        })
      },
      requestReferences: async (line: number, column: number) => {
        const editorInstance = getActiveEditorInstance()
        const model = editorInstance?.getModel?.()
        if (!model) return null
        return lspClient.sendRequest('textDocument/references', {
          textDocument: { uri: model.uri.toString() },
          position: { line: line - 1, character: column - 1 },
          context: { includeDeclaration: true },
        })
      },
      requestHover: async (line: number, column: number) => {
        const editorInstance = getActiveEditorInstance()
        const model = editorInstance?.getModel?.()
        if (!model) return null
        return lspClient.sendRequest('textDocument/hover', {
          textDocument: { uri: model.uri.toString() },
          position: { line: line - 1, character: column - 1 },
        })
      },
      requestCodeActions: async (
        line: number,
        column: number,
        diagnostic?: {
          range: {
            start: { line: number; character: number }
            end: { line: number; character: number }
          }
          severity?: number
          code?: string | number
          source?: string
          message?: string
        }
      ) => {
        const editorInstance = getActiveEditorInstance()
        const model = editorInstance?.getModel?.()
        if (!model) return null
        const range = diagnostic?.range ?? {
          start: { line: line - 1, character: column - 1 },
          end: { line: line - 1, character: column - 1 },
        }
        return lspClient.sendRequest('textDocument/codeAction', {
          textDocument: { uri: model.uri.toString() },
          range,
          context: {
            diagnostics: diagnostic ? [diagnostic] : [],
            only: ['quickfix'],
          },
        })
      },
      // Append text to the active model via `executeEdits`, mirroring
      // what user typing does (LSP picks up the didChange via its
      // normal listener). Returns the 1-based line number of the
      // first inserted line, so tests can position the cursor there.
      appendToEditor: (text: string): number | null => {
        const editorInstance = getActiveEditorInstance()
        const model = editorInstance?.getModel?.()
        if (!editorInstance || !model) return null
        const lastLine = model.getLineCount()
        const lastColumn = model.getLineLength(lastLine) + 1
        const insertedFirstLine = lastLine
        editorInstance.executeEdits('lex-test-append', [
          {
            range: new monaco.Range(lastLine, lastColumn, lastLine, lastColumn),
            text,
            forceMoveMarkers: true,
          },
        ])
        return insertedFirstLine
      },
      applyWorkspaceEdit: (edit: {
        changes?: Record<
          string,
          Array<{
            range: {
              start: { line: number; character: number }
              end: { line: number; character: number }
            }
            newText: string
          }>
        >
      }) => {
        // Minimal applier for the LSP WorkspaceEdit `changes` form
        // (which is what lex-lsp emits for label-policy quickfixes).
        // LSP ranges are 0-indexed line/char; Monaco wants 1-indexed
        // line/column — converting both ends. Edits are applied in
        // descending order so an earlier edit doesn't shift later
        // ranges.
        if (!edit.changes) return false
        for (const [uri, edits] of Object.entries(edit.changes)) {
          const model = monaco.editor.getModel(monaco.Uri.parse(uri))
          if (!model) continue
          const sorted = [...edits].sort((a, b) => {
            if (a.range.start.line !== b.range.start.line) {
              return b.range.start.line - a.range.start.line
            }
            return b.range.start.character - a.range.start.character
          })
          for (const e of sorted) {
            model.applyEdits([
              {
                range: new monaco.Range(
                  e.range.start.line + 1,
                  e.range.start.character + 1,
                  e.range.end.line + 1,
                  e.range.end.character + 1
                ),
                text: e.newText,
              },
            ])
          }
        }
        return true
      },
      triggerFormatTable: async () => {
        const editorInstance = getActiveEditorInstance()
        if (!editorInstance) return false
        const action = editorInstance.getAction('lex.formatTable')
        if (!action) return false
        await action.run()
        return true
      },

      // Injection highlighter introspection — exposed so e2e tests can
      // verify that embedded code inside `:: <lang> ::` verbatim blocks
      // gets categorised tokens back from the Monaco host adapter.
      getInjectionZones: () => {
        const target = activePaneId ?? panesRef.current[0]?.id ?? null
        if (!target) return []
        const highlighter = paneHandles.current.get(target)?.getInjectionHighlighter()
        return highlighter?.getInjectionZones() ?? []
      },
      getInjectionRanges: () => {
        const target = activePaneId ?? panesRef.current[0]?.id ?? null
        if (!target) return []
        const highlighter = paneHandles.current.get(target)?.getInjectionHighlighter()
        return highlighter?.getInjectionRanges() ?? []
      },
      getInjectionRangesByCategory: () => {
        const target = activePaneId ?? panesRef.current[0]?.id ?? null
        if (!target) return {}
        const highlighter = paneHandles.current.get(target)?.getInjectionHighlighter()
        const byCategory = highlighter?.getRangesByCategory()
        if (!byCategory) return {}
        const out: Record<string, unknown[]> = {}
        for (const [cat, ranges] of byCategory) {
          out[cat] = ranges
        }
        return out
      },
      refreshInjectionHighlighter: async () => {
        const target = activePaneId ?? panesRef.current[0]?.id ?? null
        if (!target) return false
        const highlighter = paneHandles.current.get(target)?.getInjectionHighlighter()
        if (!highlighter) return false
        await highlighter.refresh()
        return true
      },
    }
    window.__e2e.bridge = api
    return () => {
      if (window.__e2e.bridge === api) {
        window.__e2e.bridge = {}
      }
    }
  }, [activePaneId, openFileInPane, panes, paneHandles, panesRef, setRootPath])
}
