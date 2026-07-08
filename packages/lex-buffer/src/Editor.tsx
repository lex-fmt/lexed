/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import * as monaco from 'monaco-editor'
import { initializeMonaco, applyTheme, type ThemeMode } from './monaco'
import { initVimMode } from 'monaco-vim'
import { lspClient } from './lsp/client'
import { buildFormattingOptions, notifyLexTest } from './lsp/providers/formatting'
import { navigateTableCell, formatTableAtCursor } from './lsp/table_commands'
import type { LspTextEdit } from './lsp/types'

initializeMonaco()

export interface EditorProps {
  /**
   * The Monaco model to render. Hosts create models via
   * `getOrCreateModel(path, content)` so the LSP `didOpen`/`didChange`
   * lifecycle is wired automatically.
   */
  model: monaco.editor.ITextModel | null
  /** Vim mode toggle. Requires the optional `monaco-vim` peer dep. */
  vimEnabled?: boolean
  /** DOM node where vim mode renders its status line. */
  vimStatusNode?: HTMLDivElement | null
  /** Show a ruler at the given column (off when undefined or 0). */
  rulerWidth?: number
  /** Theme applied on mount and on prop change. */
  theme?: ThemeMode
  /**
   * Called once with the Monaco editor instance after creation. Hosts
   * use this to install host-specific decorations (e.g. tree-sitter
   * injection highlighter, custom command actions).
   */
  onReady?: (editor: monaco.editor.IStandaloneCodeEditor) => void
}

export interface EditorHandle {
  /** Run the LSP formatter against the current model. */
  format: () => Promise<void>
  /** Open Monaco's built-in find widget. */
  find: () => void
  /** Open Monaco's built-in find/replace widget. */
  replace: () => void
  /** Returns the underlying Monaco editor instance, or null if disposed. */
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null
  /** Returns the current document text, or '' if no model. */
  getValue: () => string
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { model, vimEnabled, vimStatusNode, rulerWidth, theme, onReady },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const vimModeRef = useRef<any>(null)
  const attachedStatusNodeRef = useRef<HTMLDivElement | null>(null)

  const formatWithLsp = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return
    const m = editor.getModel()
    if (!m || m.getLanguageId() !== 'lex') {
      return
    }

    const modelOptions = m.getOptions()
    const tabSize = modelOptions.tabSize ?? 4
    const insertSpaces = modelOptions.insertSpaces ?? true
    const params = {
      textDocument: { uri: m.uri.toString() },
      options: buildFormattingOptions(tabSize, insertSpaces)
    }
    notifyLexTest({ type: 'document', params })

    let edits: LspTextEdit[] | null
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
      text: edit.newText
    }))

    editor.pushUndoStop()
    editor.executeEdits('lex-format', monacoEdits)
    editor.pushUndoStop()
  }, [])

  useImperativeHandle(ref, () => ({
    format: formatWithLsp,
    getEditor: () => editorRef.current,
    getValue: () => editorRef.current?.getModel()?.getValue() ?? '',
    find: () => {
      editorRef.current?.trigger('menu', 'actions.find', null)
    },
    replace: () => {
      editorRef.current?.trigger('menu', 'editor.action.startFindReplaceAction', null)
    }
  }))

  // Push a new model into the existing Monaco instance whenever the
  // host swaps it. Equivalent to the old `switchToFile` path, except
  // the host owns the disk read + model creation now.
  useEffect(() => {
    if (!editorRef.current) return
    editorRef.current.setModel(model)
  }, [model])

  // Toggle vim mode in response to host props.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) {
      return
    }

    if (!vimEnabled || !vimStatusNode) {
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
  }, [vimEnabled, vimStatusNode])

  // Apply theme on mount and on change. The host owns theme detection;
  // Editor just renders what it's told.
  useEffect(() => {
    if (theme) applyTheme(theme)
  }, [theme])

  // Mount the Monaco instance once. The model + vim + theme effects
  // above react to subsequent prop changes.
  useEffect(() => {
    if (!containerRef.current) return

    const editor = monaco.editor.create(containerRef.current, {
      model: model ?? null,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      padding: { top: 10, bottom: 10 },
      fontFamily: 'Geist, -apple-system, BlinkMacSystemFont, sans-serif',
      'semanticHighlighting.enabled': true,
      rulers: rulerWidth && rulerWidth > 0 ? [rulerWidth] : [],
      // The lightbulb gutter icon is visual noise in a prose editor;
      // Cmd+. still opens the quick-fix menu with the icon off.
      lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off }
    } satisfies monaco.editor.IStandaloneEditorConstructionOptions)
    editorRef.current = editor

    // Table cell navigation — Tab / Shift+Tab when the cursor is on a
    // pipe row jumps between cells (LSP-backed). Outside of pipe rows
    // the `onKeyDown` handler does not preventDefault, so Monaco's
    // default Tab (indent) / Shift+Tab (outdent) still runs.
    const tabDisposable = editor.onKeyDown((e) => {
      if (e.keyCode !== monaco.KeyCode.Tab) return
      const m = editor.getModel()
      if (!m || m.getLanguageId() !== 'lex') return
      const position = editor.getPosition()
      if (!position) return
      const lineText = m.getLineContent(position.lineNumber)
      if (!lineText.trimStart().startsWith('|')) return

      e.preventDefault()
      e.stopPropagation()
      const direction = e.shiftKey ? 'previous' : 'next'
      const fallbackCommand = e.shiftKey ? 'outdent' : 'tab'
      const runFallback = () => {
        editor.trigger('keyboard', fallbackCommand, null)
      }
      void navigateTableCell(editor, direction)
        .then((handled: boolean) => {
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
      }
    })

    if (theme) applyTheme(theme)
    onReady?.(editor)

    return () => {
      tabDisposable.dispose()
      formatTableDisposable.dispose()
      editor.dispose()
      if (vimModeRef.current) {
        vimModeRef.current.dispose()
        vimModeRef.current = null
      }
      if (attachedStatusNodeRef.current) {
        attachedStatusNodeRef.current.textContent = ''
        attachedStatusNodeRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
})
