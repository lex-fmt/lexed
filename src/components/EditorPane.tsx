import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo
} from 'react'
import {
  Editor,
  type EditorHandle,
  getOrCreateModel,
  disposeModel,
  applyTheme,
  type ThemeMode
} from '@lex-fmt/lex-buffer'
import {
  createMonacoInjectionHighlighter,
  type MonacoInjectionHighlighterApi
} from '@lex/monaco-inline-injections'
import { PreviewPane } from './PreviewPane'
import { WelcomeView } from './WelcomeView'
import { TabBar, Tab, TabDropData } from './TabBar'
import { StatusBar, ExportStatus } from './StatusBar'
import { useSettings } from '@/contexts/SettingsContext'
import { usePlatform } from '@/contexts/PlatformContext'
import { dispatchFileTreeRefresh } from '@/lib/events'
import { initTreeSitter, createLexZoneProvider } from '@/treesitter'
import type { FileContextMenuHandlers } from './FileContextMenu'
import type * as Monaco from 'monaco-editor'

/**
 * Auto-save interval in milliseconds.
 * Files are automatically saved every 5 minutes while the window has focus.
 */
const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export interface EditorPaneHandle {
  save: () => Promise<void>
  format: () => Promise<void>
  getCurrentFile: () => string | null
  getEditor: () => Monaco.editor.IStandaloneCodeEditor | null
  getInjectionHighlighter: () => MonacoInjectionHighlighterApi | null
  find: () => void
  replace: () => void
}

interface EditorPaneProps {
  tabs: Tab[]
  activeTabId: string | null
  paneId: string
  isActivePane: boolean
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabDrop?: (data: TabDropData) => void
  onFileLoaded?: (path: string | null) => void
  onCursorChange?: (line: number) => void
  exportStatus?: ExportStatus
  onActivate?: () => void
  contextMenuHandlers?: FileContextMenuHandlers
}

/**
 * Computes a simple hash checksum of the given content.
 * Uses the same algorithm as the backend (main.ts) to ensure consistency.
 */
function computeChecksum(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0
  }
  return hash.toString(16)
}

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(function EditorPane(
  {
    tabs,
    activeTabId,
    paneId,
    isActivePane,
    onTabSelect,
    onTabClose,
    onTabDrop,
    onFileLoaded,
    onCursorChange,
    exportStatus,
    onActivate,
    contextMenuHandlers
  },
  ref
) {
  const editorRef = useRef<EditorHandle>(null)
  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const [vimStatusNode, setVimStatusNode] = useState<HTMLDivElement | null>(null)
  const [activeModel, setActiveModel] = useState<Monaco.editor.ITextModel | null>(null)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeMode | undefined>(undefined)
  const previousTabsRef = useRef<Tab[]>(tabs)
  const latestOnFileLoaded = useRef(onFileLoaded)
  const latestOnCursorChange = useRef(onCursorChange)
  const injectionHighlighterRef = useRef<MonacoInjectionHighlighterApi | null>(null)
  const onReadyCleanupsRef = useRef<Array<() => void>>([])
  const platform = usePlatform()
  const { settings } = useSettings()

  useEffect(() => {
    latestOnFileLoaded.current = onFileLoaded
  }, [onFileLoaded])

  useEffect(() => {
    latestOnCursorChange.current = onCursorChange
  }, [onCursorChange])

  const activeTab = useMemo(() => {
    return tabs.find((tab) => tab.id === activeTabId) ?? null
  }, [tabs, activeTabId])

  const isPreviewTab = activeTab?.type === 'preview'

  /**
   * AUTO-SAVE SYSTEM
   *
   * Design goals:
   * 1. Automatically save user work to prevent data loss
   * 2. Never overwrite external changes (e.g., if another editor modifies the file)
   * 3. Only save when the user is actively using the editor (window focused)
   *
   * How it works:
   * - When window gains focus: start a 5-minute interval timer and capture file checksum
   * - When window loses focus: stop the timer (prevents saving stale content)
   * - On each interval tick: compare disk checksum with captured checksum
   *   - If match: safe to save, update checksum to new content
   *   - If mismatch: file was modified externally, take new checksum but don't save
   * - On manual save (Cmd+S): reset interval and checksum
   */
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** Checksum of file on disk when interval started. Used to detect external modifications. */
  const autoSaveChecksumRef = useRef<string | null>(null)

  // Push the active tab's file content into the editor by creating
  // (or reusing) a Monaco model and setting it as the active model.
  // This replaces the old `Editor.switchToFile(path)` flow — the host
  // (this component) now owns disk reads and the model lifecycle.
  useEffect(() => {
    let cancelled = false
    async function syncActiveModel() {
      if (!activeTab || activeTab.type === 'preview') {
        setActiveModel(null)
        setCurrentFile(null)
        if (!activeTab && tabs.length === 0) {
          latestOnFileLoaded.current?.(null)
        }
        return
      }
      const path = activeTab.path
      const content = await platform.fileSystem.read(path)
      if (cancelled) return
      if (content === null) {
        // Read failed (file gone, permission denied, etc.). Clear the
        // editor instead of leaving the previous tab's model on screen
        // while the tab bar shows a different active tab — that
        // divergence would let a Save write the old tab's content to
        // the new tab's path.
        console.error('[EditorPane] Failed to read', path)
        setActiveModel(null)
        setCurrentFile(null)
        latestOnFileLoaded.current?.(null)
        return
      }
      const model = getOrCreateModel(path, content)
      if (cancelled) return
      setActiveModel(model)
      setCurrentFile(path)
      latestOnFileLoaded.current?.(path)
    }
    void syncActiveModel()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, activeTab?.path, activeTab?.type])

  // Dispose models for tabs that have been removed.
  useEffect(() => {
    const previous = previousTabsRef.current
    const removedTabs = previous.filter((prevTab) => !tabs.some((tab) => tab.id === prevTab.id))
    removedTabs.forEach((tab) => disposeModel(tab.path))
    previousTabsRef.current = tabs
  }, [tabs])

  const handleTabSelect = useCallback(
    (tabId: string) => {
      onActivate?.()
      onTabSelect(tabId)
    },
    [onTabSelect, onActivate]
  )

  const handleTabClose = useCallback(
    (tabId: string) => {
      onTabClose(tabId)
    },
    [onTabClose]
  )

  const startAutoSaveInterval = useCallback(async () => {
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current)
      autoSaveIntervalRef.current = null
    }

    if (!currentFile) return

    const diskChecksum = await platform.fileSystem.checksum(currentFile)
    autoSaveChecksumRef.current = diskChecksum

    autoSaveIntervalRef.current = setInterval(async () => {
      const filePath = currentFile
      const editorInstance = editorRef.current?.getEditor()
      if (!filePath || !editorInstance) return

      const currentDiskChecksum = await platform.fileSystem.checksum(filePath)

      if (currentDiskChecksum === autoSaveChecksumRef.current) {
        const content = editorInstance.getModel()?.getValue() ?? ''
        await platform.fileSystem.write(filePath, content)
        autoSaveChecksumRef.current = computeChecksum(content)
        console.log('[AutoSave] Saved file:', filePath)
      } else {
        autoSaveChecksumRef.current = currentDiskChecksum
        console.log('[AutoSave] File modified externally, skipping save:', filePath)
      }
    }, AUTO_SAVE_INTERVAL_MS)
  }, [platform.fileSystem, currentFile])

  const stopAutoSaveInterval = useCallback(() => {
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current)
      autoSaveIntervalRef.current = null
    }
    autoSaveChecksumRef.current = null
  }, [])

  // Manual save: format-on-save honors host setting, then writes via
  // the platform adapter and refreshes the file tree (used to be in
  // Editor.handleSave, now lives in the host).
  const handleSave = useCallback(async () => {
    if (!currentFile || !editorRef.current) return
    if (settings.formatter.formatOnSave) {
      await editorRef.current.format()
    }
    const content = editorRef.current.getValue()
    await platform.fileSystem.write(currentFile, content)
    dispatchFileTreeRefresh()
    await startAutoSaveInterval()
  }, [currentFile, settings.formatter.formatOnSave, platform.fileSystem, startAutoSaveInterval])

  const handleFormat = useCallback(async () => {
    await editorRef.current?.format()
  }, [])

  useEffect(() => {
    const handleFocus = () => {
      startAutoSaveInterval()
    }

    const handleBlur = () => {
      stopAutoSaveInterval()
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    if (document.hasFocus()) {
      startAutoSaveInterval()
    }

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
      stopAutoSaveInterval()
    }
  }, [startAutoSaveInterval, stopAutoSaveInterval])

  // Listen for cursor position changes (drives the status bar's line
  // indicator).
  useEffect(() => {
    if (!editor || !latestOnCursorChange.current) return

    const disposable = editor.onDidChangeCursorPosition((e) => {
      latestOnCursorChange.current?.(e.position.lineNumber - 1)
    })

    const pos = editor.getPosition()
    if (pos) {
      latestOnCursorChange.current?.(pos.lineNumber - 1)
    }

    return () => disposable.dispose()
  }, [editor])

  // Theme: subscribe to platform theme; push down as a prop.
  useEffect(() => {
    const initialTheme = document.documentElement.getAttribute('data-theme')
    if (initialTheme === 'dark' || initialTheme === 'light') {
      setTheme(initialTheme)
      applyTheme(initialTheme)
    } else {
      void platform.theme.getCurrent().then((mode) => {
        setTheme(mode)
        applyTheme(mode)
      })
    }
    const unsubscribe = platform.theme.onChange((mode) => {
      setTheme(mode)
      applyTheme(mode)
    })
    return unsubscribe
  }, [platform.theme])

  const handleFind = useCallback(() => {
    editorRef.current?.find()
  }, [])

  const handleReplace = useCallback(() => {
    editorRef.current?.replace()
  }, [])

  // Editor.onReady: install host-specific decorations (tree-sitter
  // injection highlighter, insert-asset / insert-verbatim commands)
  // and remember disposers so we can clean up when the Monaco
  // instance is torn down (component unmount or model swap that
  // remounts).
  const onEditorReady = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor) => {
      setEditor(editor)
      onReadyCleanupsRef.current.forEach((fn) => fn())
      onReadyCleanupsRef.current = []

      // Embedded-code highlighter inside `:: python ::` / `:: js ::`
      // blocks. Tree-sitter parses the OUTER lex document to find the
      // zones; the code inside each zone is tokenized by Monaco's own
      // Monarch tokenizers (ADR-0001 — injected-language resolution
      // belongs to the host, so we take Monaco's 82 languages over five
      // bundled tree-sitter grammars). Tree-sitter loads lazily; if init
      // fails the package continues without the injection layer.
      let tsCancelled = false
      void initTreeSitter().then((ts) => {
        if (tsCancelled || !ts) return
        if (injectionHighlighterRef.current) {
          injectionHighlighterRef.current.dispose()
        }
        injectionHighlighterRef.current = createMonacoInjectionHighlighter(
          editor,
          createLexZoneProvider(ts),
          { hostLanguageId: 'lex' }
        )
      })

      // Smart paste (lex#708, lexed#136): route pastes into .lex buffers
      // through `lex/preparePaste` when the server advertises the capability.
      // Self-guards (capability + language) so it is inert otherwise.
      let smartPasteCancelled = false
      let offSmartPaste: (() => void) | undefined
      void import('../features/editing').then(({ installSmartPasteInterceptor }) => {
        // The import is async; if cleanup already ran (component unmount or
        // model swap) don't attach a listener that would never be removed.
        if (smartPasteCancelled) return
        offSmartPaste = installSmartPasteInterceptor(editor)
      })

      const offAsset = platform.commands?.onCommand('insert-asset', () => {
        void import('../commands').then(({ insertAssetReference }) => {
          insertAssetReference(editor)
        })
      })
      const offVerbatim = platform.commands?.onCommand('insert-verbatim', () => {
        void import('../commands').then(({ insertVerbatimBlock }) => {
          insertVerbatimBlock(editor)
        })
      })

      onReadyCleanupsRef.current.push(() => {
        tsCancelled = true
        injectionHighlighterRef.current?.dispose()
        injectionHighlighterRef.current = null
        smartPasteCancelled = true
        offSmartPaste?.()
        offAsset?.()
        offVerbatim?.()
      })
    },
    [platform.commands]
  )

  useEffect(() => {
    return () => {
      onReadyCleanupsRef.current.forEach((fn) => fn())
      onReadyCleanupsRef.current = []
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      format: handleFormat,
      getCurrentFile: () => currentFile,
      getEditor: () => editorRef.current?.getEditor() ?? null,
      getInjectionHighlighter: () => injectionHighlighterRef.current,
      find: handleFind,
      replace: handleReplace
    }),
    [handleSave, handleFormat, handleFind, handleReplace, currentFile]
  )

  return (
    <div className="flex flex-col flex-1 min-h-0" onMouseDown={() => onActivate?.()}>
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        paneId={paneId}
        isActivePane={isActivePane}
        onTabSelect={handleTabSelect}
        onTabClose={handleTabClose}
        onTabDrop={onTabDrop}
        contextMenuHandlers={contextMenuHandlers}
      />
      <div className="flex-1 min-h-0">
        {tabs.length === 0 ? (
          <WelcomeView />
        ) : isPreviewTab && activeTab?.previewContent ? (
          <PreviewPane content={activeTab.previewContent} />
        ) : (
          <Editor
            ref={editorRef}
            model={activeModel}
            vimEnabled={settings.editor.vimMode}
            vimStatusNode={vimStatusNode}
            rulerWidth={settings.editor.showRuler ? settings.editor.rulerWidth : undefined}
            theme={theme}
            onReady={onEditorReady}
          />
        )}
      </div>
      {!isPreviewTab && (
        <StatusBar
          editor={editor}
          exportStatus={exportStatus}
          onVimStatusNodeChange={setVimStatusNode}
        />
      )}
    </div>
  )
})
