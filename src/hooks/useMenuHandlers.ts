import { useEffect } from 'react'
import log from 'electron-log/renderer'

interface MenuHandlers {
  onNewFile?: () => void
  onOpenFile?: () => void
  onOpenFolder?: () => void
  onSave?: () => void
  onFormat?: () => void
  onExport?: (format: string) => void
  onFind?: () => void
  onReplace?: () => void
  onSplitVertical?: () => void
  onSplitHorizontal?: () => void
  onPreview?: () => void
  onInsertAsset?: () => void
  onInsertVerbatim?: () => void
  onNextAnnotation?: () => void
  onPrevAnnotation?: () => void
  onResolveAnnotation?: () => void
  onToggleAnnotations?: () => void
  onReorderFootnotes?: () => void
  onToggleHiddenFiles?: () => void
  onOpenFilePath?: (filePath: string) => void
  onShowShortcuts?: () => void
}

export function useMenuHandlers(handlers: MenuHandlers) {
  const {
    onNewFile,
    onOpenFile,
    onOpenFolder,
    onSave,
    onFormat,
    onExport,
    onFind,
    onReplace,
    onSplitVertical,
    onSplitHorizontal,
    onPreview,
    onInsertAsset,
    onInsertVerbatim,
    onNextAnnotation,
    onPrevAnnotation,
    onResolveAnnotation,
    onToggleAnnotations,
    onReorderFootnotes,
    onToggleHiddenFiles,
    onOpenFilePath,
    onShowShortcuts,
  } = handlers

  useEffect(() => {
    const subscriptions: Array<() => void> = []

    const register = (unsubscribe?: () => void) => {
      if (unsubscribe) {
        subscriptions.push(unsubscribe)
      }
    }

    if (onNewFile)
      register(
        window.ipcRenderer.onMenuNewFile(() => {
          log.info('[Menu] New File')
          onNewFile()
        })
      )
    if (onOpenFile)
      register(
        window.ipcRenderer.onMenuOpenFile(() => {
          log.info('[Menu] Open File')
          onOpenFile()
        })
      )
    if (onOpenFolder)
      register(
        window.ipcRenderer.onMenuOpenFolder(() => {
          log.info('[Menu] Open Folder')
          onOpenFolder()
        })
      )
    if (onSave)
      register(
        window.ipcRenderer.onMenuSave(() => {
          log.info('[Menu] Save')
          onSave()
        })
      )
    if (onFormat)
      register(
        window.ipcRenderer.onMenuFormat(() => {
          log.info('[Menu] Format Document')
          onFormat()
        })
      )
    if (onExport)
      register(
        window.ipcRenderer.onMenuExport((format) => {
          log.info(`[Menu] Export (${format})`)
          onExport(format)
        })
      )
    if (onFind)
      register(
        window.ipcRenderer.onMenuFind(() => {
          log.info('[Menu] Find')
          onFind()
        })
      )
    if (onReplace)
      register(
        window.ipcRenderer.onMenuReplace(() => {
          log.info('[Menu] Replace')
          onReplace()
        })
      )
    if (onSplitVertical)
      register(
        window.ipcRenderer.onMenuSplitVertical(() => {
          log.info('[Menu] Split Vertical')
          onSplitVertical()
        })
      )
    if (onSplitHorizontal)
      register(
        window.ipcRenderer.onMenuSplitHorizontal(() => {
          log.info('[Menu] Split Horizontal')
          onSplitHorizontal()
        })
      )
    if (onPreview)
      register(
        window.ipcRenderer.onMenuPreview(() => {
          log.info('[Menu] Preview')
          onPreview()
        })
      )
    if (onInsertAsset)
      register(
        window.ipcRenderer.on('menu-insert-asset', () => {
          log.info('[Menu] Insert Asset')
          onInsertAsset()
        })
      )
    if (onInsertVerbatim)
      register(
        window.ipcRenderer.on('menu-insert-verbatim', () => {
          log.info('[Menu] Insert Verbatim')
          onInsertVerbatim()
        })
      )
    if (onNextAnnotation)
      register(
        window.ipcRenderer.on('menu-next-annotation', () => {
          log.info('[Menu] Next Annotation')
          onNextAnnotation()
        })
      )
    if (onPrevAnnotation)
      register(
        window.ipcRenderer.on('menu-prev-annotation', () => {
          log.info('[Menu] Previous Annotation')
          onPrevAnnotation()
        })
      )
    if (onResolveAnnotation)
      register(
        window.ipcRenderer.on('menu-resolve-annotation', () => {
          log.info('[Menu] Resolve Annotation')
          onResolveAnnotation()
        })
      )
    if (onToggleAnnotations)
      register(
        window.ipcRenderer.on('menu-toggle-annotations', () => {
          log.info('[Menu] Toggle Annotations')
          onToggleAnnotations()
        })
      )
    if (onReorderFootnotes)
      register(
        window.ipcRenderer.on('menu-reorder-footnotes', () => {
          log.info('[Menu] Reorder Footnotes')
          onReorderFootnotes()
        })
      )
    if (onToggleHiddenFiles)
      register(
        window.ipcRenderer.on('menu-toggle-hidden-files', () => {
          log.info('[Menu] Toggle Hidden Files')
          onToggleHiddenFiles()
        })
      )
    if (onShowShortcuts)
      register(
        window.ipcRenderer.on('menu-show-shortcuts', () => {
          log.info('[Menu] Show Shortcuts')
          onShowShortcuts()
        })
      )
    if (onOpenFilePath) register(window.ipcRenderer.onOpenFilePath(onOpenFilePath))

    return () => {
      subscriptions.forEach((unsub) => unsub())
    }
  }, [
    onNewFile,
    onOpenFile,
    onOpenFolder,
    onSave,
    onFormat,
    onExport,
    onFind,
    onReplace,
    onSplitVertical,
    onSplitHorizontal,
    onPreview,
    onInsertAsset,
    onInsertVerbatim,
    onNextAnnotation,
    onPrevAnnotation,
    onResolveAnnotation,
    onToggleAnnotations,
    onReorderFootnotes,
    onOpenFilePath,
    onShowShortcuts,
    onToggleHiddenFiles,
  ])
}
