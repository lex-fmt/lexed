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
