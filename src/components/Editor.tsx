/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useEffect, useState, forwardRef, useImperativeHandle, useCallback } from 'react'
import * as monaco from 'monaco-editor'
import 'monaco-editor'
import { initializeMonaco, applyTheme, type ThemeMode } from '@/monaco'
import { getOrCreateModel, disposeModel } from '@/monaco/models'
import { ensureLspInitialized } from '@/lsp/init'
import { initVimMode } from 'monaco-vim'
import { useSettings } from '@/contexts/SettingsContext'
import { usePlatform } from '@/contexts/PlatformContext'
import { lspClient } from '@/lsp/client'
import { buildFormattingOptions, notifyLexTest } from '@/lsp/providers/formatting'
import { navigateTableCell, formatTableAtCursor } from '@/lsp/table_commands'
import type { LspTextEdit } from '@/lsp/types'
import { dispatchFileTreeRefresh } from '@/lib/events'
import { initTreeSitter } from '@/treesitter'
import {
  createMonacoInjectionHighlighter,
  type MonacoInjectionHighlighterApi,
} from '@/editor/injection_highlighter'

initializeMonaco()

interface EditorProps {
  fileToOpen?: string | null
  onFileLoaded?: (path: string) => void
  vimStatusNode?: HTMLDivElement | null
}

export interface EditorHandle {
  openFile: () => Promise<void>
  save: () => Promise<void>
  format: () => Promise<void>
  getCurrentFile: () => string | null
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null
  switchToFile: (path: string) => Promise<void>
  closeFile: (path: string) => void
  find: () => void
  replace: () => void
  getInjectionHighlighter: () => MonacoInjectionHighlighterApi | null
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { fileToOpen, onFileLoaded, vimStatusNode },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const vimModeRef = useRef<any>(null)
  const attachedStatusNodeRef = useRef<HTMLDivElement | null>(null)
  const injectionHighlighterRef = useRef<MonacoInjectionHighlighterApi | null>(null)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const { settings } = useSettings()
  const platform = usePlatform()

  const formatWithLsp = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel()
    if (!model || model.getLanguageId() !== 'lex') {
      return
    }

    const modelOptions = model.getOptions()
    const tabSize = modelOptions.tabSize ?? 4
    const insertSpaces = modelOptions.insertSpaces ?? true
    const params = {
      textDocument: { uri: model.uri.toString() },
      options: buildFormattingOptions(tabSize, insertSpaces),
    }
    notifyLexTest({ type: 'document', params })

    let edits: LspTextEdit[] | null = null
    try {
      edits = await lspClient.sendRequest('textDocument/formatting', params)
    } catch (error) {
      console.error('[LSP] Formatting failed:', error)
      return
    }

    if (!edits || edits.length === 0) {
      return
    }

    const monacoEdits = edits.map((edit) => ({
      range: new monaco.Range(
        edit.range.start.line + 1,
        edit.range.start.character + 1,
        edit.range.end.line + 1,
        edit.range.end.character + 1
      ),
      text: edit.newText,
    }))

    editor.pushUndoStop()
    editor.executeEdits('lex-format', monacoEdits)
    editor.pushUndoStop()
  }, [])

  const switchToFile = useCallback(
    async (path: string) => {
      if (!editorRef.current) return
      let model = monaco.editor.getModel(monaco.Uri.file(path))

      if (!model || model.isDisposed()) {
        const content = await platform.fileSystem.read(path)
        if (content === null) return
        model = getOrCreateModel(path, content)
      }

      editorRef.current.setModel(model)
      setCurrentFile(path)
      onFileLoaded?.(path)
    },
    [onFileLoaded, platform.fileSystem]
  )

  const closeFile = (path: string) => {
    disposeModel(path)
  }

  useImperativeHandle(ref, () => ({
    openFile: handleOpen,
    save: handleSave,
    format: formatWithLsp,
    getCurrentFile: () => currentFile,
    getEditor: () => editorRef.current,
    switchToFile,
    closeFile,
    find: () => {
      editorRef.current?.trigger('menu', 'actions.find', null)
    },
    replace: () => {
      editorRef.current?.trigger('menu', 'editor.action.startFindReplaceAction', null)
    },
    getInjectionHighlighter: () => injectionHighlighterRef.current,
  }))

  useEffect(() => {
    if (fileToOpen) {
      void switchToFile(fileToOpen)
    }
  }, [fileToOpen, switchToFile])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) {
      return
    }

    if (!settings.editor.vimMode || !vimStatusNode) {
      if (vimModeRef.current) {
        vimModeRef.current.dispose()
        vimModeRef.current = null
      }
      if (attachedStatusNodeRef.current) {
        attachedStatusNodeRef.current.textContent = ''
        attachedStatusNodeRef.current = null
      }
      return
    }

    if (vimModeRef.current && attachedStatusNodeRef.current === vimStatusNode) {
      return
    }

    if (vimModeRef.current) {
      vimModeRef.current.dispose()
      vimModeRef.current = null
    }

    vimStatusNode.textContent = ''
    vimModeRef.current = initVimMode(editor, vimStatusNode)
    attachedStatusNodeRef.current = vimStatusNode
  }, [settings.editor.vimMode, vimStatusNode])

  useEffect(() => {
    if (!containerRef.current) return

    // Use specific root if provided, otherwise settings.lastFolder, or fallback
    // Note: getWelcomeFolderPath logic is technically main-process side, but here we can try to guess or use empty string
    // Ideally, we passed it in props or context.
    // But since this is specific to correct LSP rooting:
    const root = settings.lastFolder || ''
    ensureLspInitialized(root)

    const editor = monaco.editor.create(containerRef.current, {
      model: null,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      padding: { top: 10, bottom: 10 },
      fontFamily: 'Geist, -apple-system, BlinkMacSystemFont, sans-serif',
      'semanticHighlighting.enabled': true,
      rulers: settings.editor.showRuler ? [settings.editor.rulerWidth] : [],
      // The lightbulb gutter icon is visual noise in a prose editor;
      // Cmd+. still opens the quick-fix menu with the icon off.
      lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off },
    } satisfies monaco.editor.IStandaloneEditorConstructionOptions)
    editorRef.current = editor

    // Table cell navigation — Tab / Shift+Tab when the cursor is on a
    // pipe row jumps between cells (LSP-backed). Outside of pipe rows
    // the `onKeyDown` handler does not preventDefault, so Monaco's
    // default Tab (indent) / Shift+Tab (outdent) still runs. `navigateTableCell`
    // itself guards against reentrancy (per-editor pending flag) so
    // rapid Tab presses can't race and move the cursor out of order.
    //
    // If the LSP returns {inTable: false}, errors out, or the reentrancy
    // guard drops the request and the helper returns `false`, we trigger
    // Monaco's default Tab / Shift+Tab command explicitly so the
    // keystroke isn't silently swallowed.
    const tabDisposable = editor.onKeyDown((e) => {
      if (e.keyCode !== monaco.KeyCode.Tab) return
      const model = editor.getModel()
      if (!model || model.getLanguageId() !== 'lex') return
      const position = editor.getPosition()
      if (!position) return
      const lineText = model.getLineContent(position.lineNumber)
      if (!lineText.trimStart().startsWith('|')) return

      e.preventDefault()
      e.stopPropagation()
      const direction = e.shiftKey ? 'previous' : 'next'
      const fallbackCommand = e.shiftKey ? 'outdent' : 'tab'
      const runFallback = () => {
        editor.trigger('keyboard', fallbackCommand, null)
      }
      void navigateTableCell(editor, direction)
        .then((handled) => {
          if (!handled) runFallback()
        })
        .catch(() => {
          runFallback()
        })
    })

    // Format Table at Cursor — Cmd+Shift+T (Ctrl+Shift+T on non-Mac),
    // matching vscode's existing binding. Scoped to .lex buffers via
    // the precondition so it doesn't shadow Monaco's default binding
    // in other languages.
    const formatTableDisposable = editor.addAction({
      id: 'lex.formatTable',
      label: 'Lex: Format Table at Cursor',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyT],
      precondition: "editorLangId == 'lex'",
      contextMenuGroupId: 'modification',
      run: async () => {
        await formatTableAtCursor(editor)
      },
    })

    const applyThemeFromNative = (mode: ThemeMode) => {
      applyTheme(mode)
    }

    const initialTheme = document.documentElement.getAttribute('data-theme')
    if (initialTheme === 'dark' || initialTheme === 'light') {
      applyThemeFromNative(initialTheme)
    } else {
      void platform.theme.getCurrent().then(applyThemeFromNative)
    }
    const unsubscribeTheme = platform.theme.onChange(applyThemeFromNative)

    // Listen for insert commands
    const unsubscribeInsertAsset = platform.commands?.onCommand('insert-asset', () => {
      if (editorRef.current) {
        import('../commands').then(({ insertAssetReference }) => {
          insertAssetReference(editorRef.current!)
        })
      }
    })

    const unsubscribeInsertVerbatim = platform.commands?.onCommand('insert-verbatim', () => {
      if (editorRef.current) {
        import('../commands').then(({ insertVerbatimBlock }) => {
          insertVerbatimBlock(editorRef.current!)
        })
      }
    })

    // Embedded-code highlighter inside `:: python ::` / `:: js ::` blocks.
    // Tree-sitter loads lazily; if the WASM artifacts are missing or the
    // grammar fails to init, `initTreeSitter()` resolves to null and the
    // highlighter install is skipped — LSP semantic tokens still colour
    // the rest of the document either way.
    void initTreeSitter().then((ts) => {
      if (!ts || !editorRef.current) return
      if (injectionHighlighterRef.current) {
        injectionHighlighterRef.current.dispose()
      }
      injectionHighlighterRef.current = createMonacoInjectionHighlighter(editorRef.current, ts)
    })

    return () => {
      tabDisposable.dispose()
      formatTableDisposable.dispose()
      injectionHighlighterRef.current?.dispose()
      injectionHighlighterRef.current = null
      editor.dispose()
      if (vimModeRef.current) {
        vimModeRef.current.dispose()
        vimModeRef.current = null
      }
      if (attachedStatusNodeRef.current) {
        attachedStatusNodeRef.current.textContent = ''
        attachedStatusNodeRef.current = null
      }
      unsubscribeTheme()
      unsubscribeInsertAsset?.()
      unsubscribeInsertVerbatim?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOpen = async () => {
    const result = await platform.fileSystem.openDialog()
    if (result && editorRef.current) {
      const { filePath, content } = result
      const model = getOrCreateModel(filePath, content)
      editorRef.current.setModel(model)
      setCurrentFile(filePath)
      onFileLoaded?.(filePath)
    }
  }

  const handleSave = async () => {
    if (currentFile && editorRef.current) {
      if (settings.formatter.formatOnSave) {
        await handleFormat()
      }
      await platform.fileSystem.write(currentFile, editorRef.current.getValue())
      dispatchFileTreeRefresh()
    }
  }

  const handleFormat = formatWithLsp

  // ... existing code

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
})
