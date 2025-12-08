import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as monaco from 'monaco-editor'
import { toast } from 'sonner'
import type { EditorPaneHandle } from './components/EditorPane'
import { Layout } from './components/Layout'
import { Outline } from './components/Outline'
import { ExportStatus } from './components/StatusBar'
import type { Tab } from './components/TabBar'
import { PaneWorkspace } from './components/PaneWorkspace'
import { usePersistedPaneLayout } from '@/panes/usePersistedPaneLayout'
import { usePaneManager } from '@/panes/usePaneManager'
import {
  insertAsset,
  insertVerbatim,
  resolveAnnotation,
  toggleAnnotations,
} from './features/editing'
import { nextAnnotation, previousAnnotation } from './features/navigation'
import { exportContent, importContent, convertToHtml } from './features/interop'
import { isLexFile, isMarkdownFile } from '@/lib/files'
import type { FileContextMenuHandlers } from './components/FileContextMenu'
import { createPreviewTab, placePreviewTab } from '@/features/preview'
import { useRootFolder } from '@/hooks/useRootFolder'
import { useMenuStateSync } from '@/hooks/useMenuStateSync'
import { useLexTestBridge } from '@/hooks/useLexTestBridge'
import { useMenuHandlers } from '@/hooks/useMenuHandlers'
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext'
import { dispatchFileTreeRefresh } from '@/lib/events'
import { KEYBINDING_DEFINITIONS } from '@/keybindings/definitions'
import { detectKeybindingPlatform } from '@/keybindings/platform'
import { KeybindingManager } from '@/keybindings/manager'
import { getVisualPaneOrder, getVisualTabOrder } from '@/panes/order'
import { CommandPalette } from '@/components/CommandPalette'
import { ShortcutsModal } from '@/components/ShortcutsModal'
import { LspErrorModal } from '@/components/LspErrorModal'
import log from 'electron-log/renderer'

interface LspErrorInfo {
  title: string
  message: string
  suggestion?: string
}

const createTabFromPath = (path: string): Tab => ({
  id: path,
  path,
  name: path.split('/').pop() || path,
})

function AppContent() {
  const {
    panes,
    paneRows,
    setPanes,
    setPaneRows,
    setActivePaneId,
    resolvedActivePane,
    resolvedActivePaneId,
  } = usePersistedPaneLayout(createTabFromPath)
  const { settings } = useSettings()
  const { rootPath, setRootPath } = useRootFolder()
  const [exportStatus, setExportStatus] = useState<ExportStatus>({
    isExporting: false,
    format: null,
  })
  const paneHandles = useRef(new Map<string, EditorPaneHandle | null>())
  const panesRef = useRef(panes)
  const platform = useMemo(() => detectKeybindingPlatform(), [])
  const keybindingManagerRef = useRef<KeybindingManager | null>(null)

  if (!keybindingManagerRef.current) {
    keybindingManagerRef.current = new KeybindingManager(KEYBINDING_DEFINITIONS, {
      platform,
      overrides: settings.keybindings,
    })
  }

  const keybindingManager = keybindingManagerRef.current
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [isShortcutsOpen, setShortcutsOpen] = useState(false)
  const [lspError, setLspError] = useState<LspErrorInfo | null>(null)
  const [isLspModalOpen, setLspModalOpen] = useState(false)
  const handleShortcutsClose = useCallback(() => {
    if (isShortcutsOpen) {
      log.info('[Keybindings] Close shortcuts modal')
    }
    setShortcutsOpen(false)
  }, [isShortcutsOpen])

  const ensureLspAvailable = useCallback(() => {
    if (lspError) {
      setLspModalOpen(true)
      return false
    }
    return true
  }, [lspError])

  const activePaneIdValue = resolvedActivePaneId
  const activePaneFile = resolvedActivePane?.currentFile ?? null
  const activeTabId = resolvedActivePane?.activeTabId ?? null
  const isActiveFileLex = isLexFile(activePaneFile ?? null)
  const activeCursorLine = resolvedActivePane?.cursorLine ?? 0
  const activeEditor = activePaneIdValue
    ? (paneHandles.current.get(activePaneIdValue)?.getEditor() ?? null)
    : null

  useEffect(() => {
    panesRef.current = panes
  }, [panes])

  useEffect(() => {
    keybindingManagerRef.current?.updateOverrides(settings.keybindings)
  }, [settings.keybindings])

  useEffect(() => {
    if (!keybindingManager) return
    keybindingManager.setContext(
      'workspace',
      panes.some((pane) => pane.tabs.length > 0)
    )
  }, [keybindingManager, panes])

  useEffect(() => {
    if (!keybindingManager) return
    keybindingManager.setContext('editor', Boolean(activeEditor))
  }, [keybindingManager, activeEditor])

  useEffect(() => {
    if (!keybindingManager) return
    keybindingManager.setContext('modal', isCommandPaletteOpen || isShortcutsOpen)
  }, [keybindingManager, isCommandPaletteOpen, isShortcutsOpen])

  useEffect(() => {
    const unsubscribe =
      window.ipcRenderer.onLspStatus?.((status) => {
        if (!status) return
        if (status.status === 'missing-binary') {
          setLspError({
            title: 'Lex Language Server Missing',
            message:
              status.message ??
              `Lex LSP binary was not found${status.path ? ` at ${status.path}` : ''}.`,
            suggestion:
              'Run "npm run build" once or execute scripts/download-lex-lsp.sh to download lex-lsp.',
          })
        } else if (status.status === 'error') {
          setLspError({
            title: 'Lex Language Server Error',
            message: status.message ?? 'Unable to launch the Lex language server.',
            suggestion: 'Check the terminal output for more information.',
          })
        } else if (status.status === 'stopped') {
          setLspError({
            title: 'Lex Language Server Stopped',
            message: 'The language server exited unexpectedly.',
            suggestion: 'Restart LexEd or rebuild lex-lsp to continue.',
          })
        }
      }) ?? (() => {})

    const handleReady = () => setLspError(null)
    const handleFatal = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail
      setLspError({
        title: 'Lex Language Server Unavailable',
        message: detail?.message ?? 'The language server is not responding.',
        suggestion: 'Restart LexEd or rebuild lex-lsp to continue.',
      })
    }

    window.addEventListener('lexed:lsp-ready', handleReady as EventListener)
    window.addEventListener('lexed:lsp-fatal', handleFatal as EventListener)

    return () => {
      unsubscribe()
      window.removeEventListener('lexed:lsp-ready', handleReady as EventListener)
      window.removeEventListener('lexed:lsp-fatal', handleFatal as EventListener)
    }
  }, [])

  useEffect(() => {
    if (lspError) {
      setLspModalOpen(true)
    }
  }, [lspError])

  useMenuStateSync(Boolean(activePaneFile), isActiveFileLex)

  const registerPaneHandle = useCallback(
    (paneId: string) => (instance: EditorPaneHandle | null) => {
      if (!instance) {
        return
      }
      const currentInstance = paneHandles.current.get(paneId) ?? null
      if (currentInstance === instance) {
        return
      }
      paneHandles.current.set(paneId, instance)
    },
    []
  )

  useEffect(() => {
    const ids = new Set(panes.map((pane) => pane.id))
    for (const [paneId] of paneHandles.current) {
      if (!ids.has(paneId)) {
        paneHandles.current.delete(paneId)
      }
    }
  }, [panes])

  const {
    focusPane,
    handleSplitVertical,
    handleSplitHorizontal,
    handleClosePane,
    openFileInPane,
    handleTabSelect,
    handleTabClose,
    handleTabDrop,
    handlePaneFileLoaded,
    handlePaneCursorChange,
  } = usePaneManager({
    activePaneId: activePaneIdValue,
    setActivePaneId,
    setPanes,
    setPaneRows,
    createTabFromPath,
  })

  useLexTestBridge({
    activePaneId: activePaneIdValue,
    paneHandles,
    panesRef,
    panes,
    openFileInPane,
  })

  const handleNewFile = useCallback(async () => {
    log.info('Action: New File')
    if (!activePaneIdValue) return
    const result = await window.ipcRenderer.fileNew(rootPath)
    if (result) {
      log.debug('New file created', result.filePath)
      openFileInPane(activePaneIdValue, result.filePath)
      dispatchFileTreeRefresh()
    }
  }, [rootPath, activePaneIdValue, openFileInPane])

  const handleOpenFolder = useCallback(async () => {
    log.info('Action: Open Folder')
    const result = (await window.ipcRenderer.invoke('folder-open')) as string | null
    if (result) {
      setRootPath(result)
      await window.ipcRenderer.setLastFolder(result)
    }
  }, [setRootPath])

  const handleOpenFile = useCallback(async () => {
    log.info('Action: Open File')
    if (!activePaneIdValue) return
    const result = await window.ipcRenderer.fileOpen()
    if (result) {
      log.debug('File opened', result.filePath)
      openFileInPane(activePaneIdValue, result.filePath)
    }
  }, [activePaneIdValue, openFileInPane])

  const handleSave = useCallback(async () => {
    log.info('Action: Save')
    if (!activePaneIdValue) return
    const handle = paneHandles.current.get(activePaneIdValue)
    await handle?.save()
  }, [activePaneIdValue])

  const handleFormat = useCallback(async () => {
    log.info('Action: Format')
    if (!ensureLspAvailable()) return
    if (!activePaneIdValue) return
    const handle = paneHandles.current.get(activePaneIdValue)
    await handle?.format()
  }, [activePaneIdValue, ensureLspAvailable])

  const handleFind = useCallback(() => {
    if (!activePaneIdValue) return
    paneHandles.current.get(activePaneIdValue)?.find()
  }, [activePaneIdValue])

  const handleReplace = useCallback(() => {
    if (!activePaneIdValue) return
    paneHandles.current.get(activePaneIdValue)?.replace()
  }, [activePaneIdValue])

  const handleShareWhatsApp = useCallback(async () => {
    if (!activeEditor) {
      toast.error('No document to share')
      return
    }
    const content = activeEditor.getValue()
    if (!content.trim()) {
      toast.error('Document is empty')
      return
    }
    await window.ipcRenderer.shareWhatsApp(content)
  }, [activeEditor])

  const handleConvertToLex = useCallback(async () => {
    if (!ensureLspAvailable()) {
      return
    }
    if (!activePaneFile || !activePaneIdValue) {
      toast.error('No file open to convert')
      return
    }

    const handle = paneHandles.current.get(activePaneIdValue)
    const editor = handle?.getEditor()
    if (!editor) {
      toast.error('No active editor')
      return
    }

    setExportStatus({ isExporting: true, format: 'lex' })

    try {
      // Import markdown content to lex via LSP
      const content = editor.getValue()
      const lexContent = await importContent(content, 'markdown')

      // Write to file with .lex extension
      const outputPath = activePaneFile.replace(/\.(md|markdown)$/i, '.lex')
      await window.ipcRenderer.invoke('file-save', outputPath, lexContent)

      const fileName = outputPath.split('/').pop() || outputPath
      toast.success(`Converted to ${fileName}`)
      openFileInPane(activePaneIdValue, outputPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Conversion failed'
      toast.error(message)
    } finally {
      setExportStatus({ isExporting: false, format: null })
    }
  }, [activePaneFile, activePaneIdValue, openFileInPane, ensureLspAvailable])

  const handleExport = useCallback(
    async (format: string) => {
      if (!ensureLspAvailable()) {
        return
      }
      if (!activePaneFile) {
        toast.error('No file open to export')
        return
      }

      if (!activePaneIdValue) return
      const handle = paneHandles.current.get(activePaneIdValue)
      const editor = handle?.getEditor()
      if (!editor) {
        toast.error('No active editor')
        return
      }

      setExportStatus({ isExporting: true, format })

      try {
        const content = editor.getValue()
        const sourceUri = `file://${activePaneFile}`

        // Calculate output path
        const ext = format === 'markdown' ? 'md' : format
        const outputPath = activePaneFile.replace(/\.lex$/i, `.${ext}`)

        if (format === 'pdf') {
          // PDF is binary - LSP writes directly to file
          await exportContent(content, 'pdf', sourceUri, outputPath)
        } else {
          // Text formats - get content from LSP and write to file
          const result = await exportContent(content, format as 'markdown' | 'html', sourceUri)
          await window.ipcRenderer.invoke('file-save', outputPath, result)
        }

        const fileName = outputPath.split('/').pop() || outputPath
        toast.success(`Exported to ${fileName}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Export failed'
        toast.error(message)
      } finally {
        setExportStatus({ isExporting: false, format: null })
      }
    },
    [activePaneFile, activePaneIdValue, ensureLspAvailable]
  )

  const handlePreview = useCallback(async () => {
    if (!ensureLspAvailable()) {
      return
    }
    if (!activePaneFile || !isLexFile(activePaneFile)) {
      toast.error('Preview requires a .lex file')
      return
    }

    if (!activePaneIdValue) {
      return
    }

    const handle = paneHandles.current.get(activePaneIdValue)
    const editor = handle?.getEditor()
    if (!editor) {
      toast.error('No active editor')
      return
    }

    try {
      // Get content from editor and convert to HTML via LSP
      const content = editor.getValue()
      const htmlContent = await convertToHtml(content)
      const previewTab = createPreviewTab(activePaneFile, htmlContent)
      placePreviewTab({
        activePaneId: activePaneIdValue,
        panes,
        previewTab,
        setPanes,
        setPaneRows,
        setActivePaneId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preview failed'
      toast.error(message)
    }
  }, [
    activePaneFile,
    activePaneIdValue,
    panes,
    setActivePaneId,
    setPaneRows,
    setPanes,
    ensureLspAvailable,
  ])

  const handleFileSelect = useCallback(
    (path: string) => {
      if (!activePaneIdValue) return
      openFileInPane(activePaneIdValue, path)
    },
    [activePaneIdValue, openFileInPane]
  )

  const handleInsertAsset = useCallback(async () => {
    log.info('Action: Insert Asset')
    console.log('handleInsertAsset called')
    if (!ensureLspAvailable()) return
    if (!activeEditor) {
      console.log('handleInsertAsset: no active editor')
      return
    }
    const path = (await window.ipcRenderer.invoke('file-pick', {
      title: 'Select Asset',
      filters: [{ name: 'All Files', extensions: ['*'] }],
    })) as string | null
    console.log('handleInsertAsset: path selected', path)
    if (path) {
      await insertAsset(activeEditor, path)
    }
  }, [activeEditor, ensureLspAvailable])

  const handleInsertVerbatim = useCallback(async () => {
    if (!ensureLspAvailable()) return
    if (!activeEditor) return
    const path = (await window.ipcRenderer.invoke('file-pick', {
      title: 'Select File for Verbatim Block',
      filters: [{ name: 'All Files', extensions: ['*'] }],
    })) as string | null
    if (path) {
      await insertVerbatim(activeEditor, path)
    }
  }, [activeEditor, ensureLspAvailable])

  const handleNextAnnotation = useCallback(async () => {
    if (!ensureLspAvailable()) return
    if (!activeEditor) return
    const location = await nextAnnotation(activeEditor)
    if (location) {
      // If location is in another file, we might need to open it.
      // For now, assuming same file navigation or that LSP handles file switching if we implement it fully.
      // But monaco-editor is single model usually unless we handle it.
      // The current implementation of nextAnnotation returns a Location.
      // If it's the same file, we can just reveal it.
      // If it's a different file, we need to open it.

      // Check if URI matches current model
      const currentUri = activeEditor.getModel()?.uri.toString()
      if (location.uri === currentUri) {
        const pos = new monaco.Position(
          location.range.start.line + 1,
          location.range.start.character + 1
        )
        activeEditor.setPosition(pos)
        activeEditor.revealPosition(pos)
      } else {
        // TODO: Handle navigation to other files
        // For now, let's just log it or toast
        toast.info('Annotation is in another file: ' + location.uri)
      }
    } else {
      log.info('No more annotations')
      toast.info('No more annotations')
    }
  }, [activeEditor, ensureLspAvailable])

  const handlePrevAnnotation = useCallback(async () => {
    if (!ensureLspAvailable()) return
    if (!activeEditor) return
    const location = await previousAnnotation(activeEditor)
    if (location) {
      const currentUri = activeEditor.getModel()?.uri.toString()
      if (location.uri === currentUri) {
        const pos = new monaco.Position(
          location.range.start.line + 1,
          location.range.start.character + 1
        )
        activeEditor.setPosition(pos)
        activeEditor.revealPosition(pos)
      } else {
        toast.info('Annotation is in another file: ' + location.uri)
      }
    } else {
      toast.info('No previous annotations')
    }
  }, [activeEditor, ensureLspAvailable])

  const handleResolveAnnotation = useCallback(async () => {
    if (!ensureLspAvailable()) return
    if (!activeEditor) return
    await resolveAnnotation(activeEditor)
  }, [activeEditor, ensureLspAvailable])

  const handleToggleAnnotations = useCallback(async () => {
    if (!ensureLspAvailable()) return
    if (!activeEditor) return
    await toggleAnnotations(activeEditor)
  }, [activeEditor, ensureLspAvailable])

  const handleOpenFilePath = useCallback(
    (filePath: string) => {
      if (!activePaneIdValue) return
      openFileInPane(activePaneIdValue, filePath)
    },
    [activePaneIdValue, openFileInPane]
  )

  const selectRelativeTab = useCallback(
    (direction: 1 | -1) => {
      if (!activePaneIdValue || !activeTabId) {
        return false
      }
      const orderedTabs = getVisualTabOrder(paneRows, panes)
      if (orderedTabs.length === 0) {
        return false
      }
      let currentIndex = orderedTabs.findIndex(
        (entry) => entry.paneId === activePaneIdValue && entry.tabId === activeTabId
      )
      if (currentIndex === -1) {
        currentIndex = orderedTabs.findIndex((entry) => entry.paneId === activePaneIdValue)
        if (currentIndex === -1) {
          return false
        }
      }
      const nextIndex = (currentIndex + direction + orderedTabs.length) % orderedTabs.length
      const nextEntry = orderedTabs[nextIndex]
      if (nextEntry.paneId !== activePaneIdValue) {
        focusPane(nextEntry.paneId)
      }
      handleTabSelect(nextEntry.paneId, nextEntry.tabId)
      if (nextEntry.paneId !== activePaneIdValue) {
        const handle = paneHandles.current.get(nextEntry.paneId)
        handle?.getEditor()?.focus()
      }
      return true
    },
    [activePaneIdValue, activeTabId, paneRows, panes, handleTabSelect, focusPane]
  )

  const focusPaneByIndex = useCallback(
    (position: number) => {
      if (Number.isNaN(position) || position < 1) {
        return false
      }
      const orderedPanes = getVisualPaneOrder(paneRows, panes)
      const target = orderedPanes[position - 1]
      if (!target) {
        return false
      }
      const pane = target.pane
      if (pane.tabs.length > 0) {
        const nextTabId = pane.activeTabId ?? pane.tabs[0].id
        handleTabSelect(pane.id, nextTabId)
      } else {
        focusPane(pane.id)
      }
      return true
    },
    [paneRows, panes, handleTabSelect, focusPane]
  )

  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      toast.success('Path copied to clipboard')
    } catch {
      toast.error('Failed to copy path')
    }
  }, [])

  const handleCopyRelativePath = useCallback(
    async (path: string) => {
      try {
        let relativePath = path
        if (rootPath) {
          const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
          const normalizedPath = path.replace(/\\/g, '/')
          if (normalizedPath.startsWith(normalizedRoot + '/')) {
            relativePath = normalizedPath.slice(normalizedRoot.length + 1)
          } else if (normalizedPath.startsWith(normalizedRoot)) {
            relativePath = normalizedPath.slice(normalizedRoot.length)
          }
        }
        await navigator.clipboard.writeText(relativePath)
        toast.success('Relative path copied to clipboard')
      } catch {
        toast.error('Failed to copy path')
      }
    },
    [rootPath]
  )

  const handleKeybindingAction = useCallback(
    (actionId: string) => {
      if (actionId === 'workspace.tab.next') {
        return selectRelativeTab(1)
      }
      if (actionId === 'workspace.tab.previous') {
        return selectRelativeTab(-1)
      }
      if (actionId.startsWith('workspace.pane.focus.')) {
        const position = Number(actionId.split('.').pop())
        return focusPaneByIndex(position)
      }
      if (actionId === 'workspace.pane.split.horizontal') {
        handleSplitHorizontal()
        return true
      }
      if (actionId === 'workspace.pane.split.vertical') {
        handleSplitVertical()
        return true
      }
      if (actionId === 'editor.showReplace') {
        handleReplace()
        return true
      }
      if (actionId === 'commandPalette.show') {
        setCommandPaletteOpen((prev) => !prev)
        return true
      }
      if (actionId === 'workspace.shortcuts.show') {
        setShortcutsOpen((prev) => {
          const next = !prev
          log.info(
            next ? '[Keybindings] Open shortcuts modal' : '[Keybindings] Close shortcuts modal'
          )
          return next
        })
        return true
      }
      if (actionId === 'file.copyPath') {
        if (activePaneFile) {
          void handleCopyPath(activePaneFile)
          return true
        }
        return false
      }
      if (actionId === 'file.copyRelativePath') {
        if (activePaneFile) {
          void handleCopyRelativePath(activePaneFile)
          return true
        }
        return false
      }
      return false
    },
    [
      activePaneFile,
      focusPaneByIndex,
      handleCopyPath,
      handleCopyRelativePath,
      handleReplace,
      handleSplitHorizontal,
      handleSplitVertical,
      selectRelativeTab,
      setCommandPaletteOpen,
      setShortcutsOpen,
    ]
  )

  useEffect(() => {
    if (!keybindingManager) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const match = keybindingManager.handleEvent({
        code: event.code,
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        targetTagName: (event.target as HTMLElement | null)?.tagName,
      })
      if (!match) {
        return
      }
      const handled = handleKeybindingAction(match.id)
      if (handled) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [keybindingManager, handleKeybindingAction])

  useMenuHandlers({
    onNewFile: handleNewFile,
    onOpenFile: handleOpenFile,
    onOpenFolder: handleOpenFolder,
    onSave: handleSave,
    onFormat: handleFormat,
    onExport: handleExport,
    onFind: handleFind,
    onReplace: handleReplace,
    onSplitVertical: handleSplitVertical,
    onSplitHorizontal: handleSplitHorizontal,
    onPreview: handlePreview,
    onInsertAsset: handleInsertAsset,
    onInsertVerbatim: handleInsertVerbatim,
    onNextAnnotation: handleNextAnnotation,
    onPrevAnnotation: handlePrevAnnotation,
    onResolveAnnotation: handleResolveAnnotation,
    onToggleAnnotations: handleToggleAnnotations,
    onOpenFilePath: handleOpenFilePath,
  })

  // File context menu handlers - these operate on a file path directly (e.g., from right-click menu)
  const fileContextMenuHandlers = useMemo(
    (): FileContextMenuHandlers => ({
      onExport: async (format, path) => {
        if (!ensureLspAvailable()) return
        if (!isLexFile(path)) {
          toast.error('Export requires a .lex file')
          return
        }

        setExportStatus({ isExporting: true, format })

        try {
          const content = await window.ipcRenderer.fileRead(path)
          if (!content) {
            toast.error('Could not read file')
            return
          }
          const sourceUri = `file://${path}`
          const ext = format === 'markdown' ? 'md' : format
          const outputPath = path.replace(/\.lex$/i, `.${ext}`)

          const result = await exportContent(content, format, sourceUri)
          await window.ipcRenderer.invoke('file-save', outputPath, result)

          const fileName = outputPath.split('/').pop() || outputPath
          toast.success(`Exported to ${fileName}`)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Export failed'
          toast.error(message)
        } finally {
          setExportStatus({ isExporting: false, format: null })
        }
      },
      onPreview: async (path) => {
        if (!ensureLspAvailable()) return
        if (!isLexFile(path)) {
          toast.error('Preview requires a .lex file')
          return
        }
        if (!activePaneIdValue) return

        try {
          const content = await window.ipcRenderer.fileRead(path)
          if (!content) {
            toast.error('Could not read file')
            return
          }
          const htmlContent = await convertToHtml(content)
          const previewTab = createPreviewTab(path, htmlContent)
          placePreviewTab({
            activePaneId: activePaneIdValue,
            panes,
            previewTab,
            setPanes,
            setPaneRows,
            setActivePaneId,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Preview failed'
          toast.error(message)
        }
      },
      onConvertToLex: async (path) => {
        if (!ensureLspAvailable()) return
        if (!isMarkdownFile(path)) {
          toast.error('Convert to Lex requires a markdown file')
          return
        }
        if (!activePaneIdValue) return

        setExportStatus({ isExporting: true, format: 'lex' })

        try {
          const content = await window.ipcRenderer.fileRead(path)
          if (!content) {
            toast.error('Could not read file')
            return
          }
          const lexContent = await importContent(content, 'markdown')
          const outputPath = path.replace(/\.(md|markdown)$/i, '.lex')
          await window.ipcRenderer.invoke('file-save', outputPath, lexContent)

          const fileName = outputPath.split('/').pop() || outputPath
          toast.success(`Converted to ${fileName}`)
          openFileInPane(activePaneIdValue, outputPath)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Conversion failed'
          toast.error(message)
        } finally {
          setExportStatus({ isExporting: false, format: null })
        }
      },
      onFormat: async (path) => {
        // Format requires an open editor, so open the file first
        if (!activePaneIdValue) return
        openFileInPane(activePaneIdValue, path)
        // After opening, the user can use the toolbar Format button
        toast.info('File opened - use Format button or Ctrl/Cmd+Shift+F to format')
      },
      onShareWhatsApp: async (path) => {
        if (!isLexFile(path)) {
          toast.error('Share requires a .lex file')
          return
        }
        try {
          const content = await window.ipcRenderer.fileRead(path)
          if (!content?.trim()) {
            toast.error('Document is empty')
            return
          }
          await window.ipcRenderer.shareWhatsApp(content)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Share failed'
          toast.error(message)
        }
      },
      onCopyPath: handleCopyPath,
      onCopyRelativePath: handleCopyRelativePath,
    }),
    [
      activePaneIdValue,
      ensureLspAvailable,
      handleCopyPath,
      handleCopyRelativePath,
      openFileInPane,
      panes,
      setActivePaneId,
      setPaneRows,
      setPanes,
    ]
  )

  const keybindingDescriptors = keybindingManager?.getDescriptors() ?? []
  const paletteCommands = keybindingDescriptors.filter(
    (descriptor) => descriptor.id !== 'commandPalette.show'
  )

  return (
    <>
      <Layout
        rootPath={rootPath}
        onFileSelect={handleFileSelect}
        onNewFile={handleNewFile}
        onOpenFolder={handleOpenFolder}
        onOpenFile={handleOpenFile}
        onSave={handleSave}
        onFormat={handleFormat}
        onExport={handleExport}
        onShareWhatsApp={handleShareWhatsApp}
        onConvertToLex={handleConvertToLex}
        onFind={handleFind}
        onReplace={handleReplace}
        onSplitVertical={handleSplitVertical}
        onSplitHorizontal={handleSplitHorizontal}
        onPreview={handlePreview}
        currentFile={activePaneFile}
        fileContextMenuHandlers={fileContextMenuHandlers}
        panel={
          <Outline
            currentFile={activePaneFile}
            editor={activeEditor}
            cursorLine={activeCursorLine}
          />
        }
      >
        <PaneWorkspace
          panes={panes}
          paneRows={paneRows}
          activePaneId={activePaneIdValue}
          exportStatus={exportStatus}
          registerPaneHandle={registerPaneHandle}
          onFocusPane={focusPane}
          onClosePane={handleClosePane}
          onTabSelect={handleTabSelect}
          onTabClose={handleTabClose}
          onTabDrop={handleTabDrop}
          onFileLoaded={handlePaneFileLoaded}
          onCursorChange={handlePaneCursorChange}
          onPaneRowsChange={setPaneRows}
          fileContextMenuHandlers={fileContextMenuHandlers}
        />
      </Layout>
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        commands={paletteCommands}
        onClose={() => setCommandPaletteOpen(false)}
        onSelect={(commandId) => {
          handleKeybindingAction(commandId)
        }}
      />
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        shortcuts={keybindingDescriptors}
        onClose={handleShortcutsClose}
      />
      {lspError && (
        <LspErrorModal
          isOpen={isLspModalOpen}
          title={lspError.title}
          message={lspError.message}
          suggestion={lspError.suggestion}
          onClose={() => setLspModalOpen(false)}
          autoDismissMs={15000}
        />
      )}
    </>
  )
}

function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  )
}

export default App
