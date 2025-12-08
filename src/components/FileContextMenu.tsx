import { useCallback, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { getFileActions, type FileActionId } from '@/lib/files'

export interface FileContextMenuPosition {
  x: number
  y: number
  path: string
}

export interface FileContextMenuHandlers {
  onExport?: (format: 'markdown' | 'html', path: string) => void
  onPreview?: (path: string) => void
  onConvertToLex?: (path: string) => void
  onFormat?: (path: string) => void
  onShareWhatsApp?: (path: string) => void
  onCopyPath?: (path: string) => void
  onCopyRelativePath?: (path: string) => void
  onRevealInFolder?: (path: string) => void
}

interface FileContextMenuProps {
  position: FileContextMenuPosition | null
  onClose: () => void
  handlers: FileContextMenuHandlers
}

export function FileContextMenu({ position, onClose, handlers }: FileContextMenuProps) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const isWindows = navigator.platform.toUpperCase().indexOf('WIN') >= 0

  const actions = useMemo(() => {
    if (!position) return null
    const fileActions = getFileActions(position.path)
    // Adjust the reveal label based on platform
    const revealLabel = isMac
      ? 'Reveal in Finder'
      : isWindows
        ? 'Show in Explorer'
        : 'Show in File Manager'
    return {
      ...fileActions,
      revealInFolder: {
        ...fileActions.revealInFolder,
        label: revealLabel,
      },
    }
  }, [position, isMac, isWindows])

  // Close on outside click
  useEffect(() => {
    if (!position) return
    const handleClick = () => onClose()
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [position, onClose])

  // Close on escape
  useEffect(() => {
    if (!position) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [position, onClose])

  const handleAction = useCallback(
    (actionId: FileActionId) => {
      if (!position) return
      const path = position.path

      switch (actionId) {
        case 'exportMarkdown':
          handlers.onExport?.('markdown', path)
          break
        case 'exportHtml':
          handlers.onExport?.('html', path)
          break
        case 'preview':
          handlers.onPreview?.(path)
          break
        case 'convertToLex':
          handlers.onConvertToLex?.(path)
          break
        case 'format':
          handlers.onFormat?.(path)
          break
        case 'shareWhatsApp':
          handlers.onShareWhatsApp?.(path)
          break
        case 'copyPath':
          handlers.onCopyPath?.(path)
          break
        case 'copyRelativePath':
          handlers.onCopyRelativePath?.(path)
          break
        case 'revealInFolder':
          handlers.onRevealInFolder?.(path)
          break
      }
      onClose()
    },
    [position, handlers, onClose]
  )

  if (!position || !actions) return null

  const menuItems: {
    id: FileActionId
    label: string
    enabled: boolean
    separator?: boolean
    shortcut?: string
  }[] = [
    { ...actions.exportMarkdown, separator: false },
    { ...actions.exportHtml, separator: false },
    { ...actions.preview, separator: true },
    { ...actions.convertToLex, separator: true },
    { ...actions.format, separator: false },
    { ...actions.shareWhatsApp, separator: true },
    { ...actions.copyPath, separator: false, shortcut: isMac ? '⌘P' : 'Ctrl+P' },
    { ...actions.copyRelativePath, separator: false, shortcut: isMac ? '⇧⌘P' : 'Ctrl+Shift+P' },
    { ...actions.revealInFolder, separator: false },
  ]

  return (
    <div
      className="fixed bg-panel border border-border rounded-md shadow-lg py-1 z-50 min-w-[180px]"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item, index) => (
        <div key={item.id}>
          <button
            className={cn(
              'w-full px-3 py-1.5 text-left text-sm flex items-center justify-between gap-4',
              item.enabled ? 'hover:bg-panel-hover cursor-pointer' : 'opacity-50 cursor-not-allowed'
            )}
            disabled={!item.enabled}
            onClick={() => item.enabled && handleAction(item.id)}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-muted-foreground">{item.shortcut}</span>
            )}
          </button>
          {item.separator && index < menuItems.length - 1 && (
            <div className="h-px bg-border mx-2 my-1" />
          )}
        </div>
      ))}
    </div>
  )
}
