import { useEffect, useRef, useState } from 'react'
import { notifyWorkspaceFoldersChanged } from '@/lsp/init'

export function useRootFolder() {
  const [rootPath, setRootPath] = useState<string | undefined>(undefined)
  const prevRootRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    const loadInitialFolder = async () => {
      try {
        const folder = await window.ipcRenderer.getInitialFolder()
        if (mounted && folder) {
          setRootPath(folder)
        }
      } catch (error) {
        console.error('useRootFolder: failed to load initial folder', error)
      }
    }
    loadInitialFolder()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (rootPath) {
      const folderName = rootPath.split('/').pop() || rootPath
      document.title = `LexEd - ${folderName}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__lexWorkspaceRoot = rootPath
    } else {
      document.title = 'LexEd'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).__lexWorkspaceRoot) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__lexWorkspaceRoot
      }
    }

    // Notify LSP when workspace root changes
    const prev = prevRootRef.current
    if (rootPath !== prev) {
      const removed = prev ? [prev] : []
      const added = rootPath ? [rootPath] : []
      if (added.length > 0 || removed.length > 0) {
        notifyWorkspaceFoldersChanged(added, removed)
      }
      prevRootRef.current = rootPath
    }
  }, [rootPath])

  return { rootPath, setRootPath }
}
