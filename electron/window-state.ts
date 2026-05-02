import { randomUUID } from 'node:crypto'
import type { PaneLayoutSettings, PaneRowLayout, WindowState } from './window-manager'

/**
 * Return a new openWindows list with the entry for `stateId` upserted:
 * if it exists, shallow-merge the patch onto it; otherwise push a new entry
 * built from `fallback`.
 *
 * The previous implementation used `findIndex(...) >= 0` and silently dropped
 * writes for brand-new windows that had not yet gone through saveWindowState.
 * That meant the workspace root was never persisted until close, and even
 * then only if some earlier write had already created the entry.
 */
export function upsertWindowState(
  openWindows: WindowState[],
  stateId: string,
  patch: Partial<WindowState>,
  fallback: Omit<WindowState, 'id'>
): WindowState[] {
  const next = openWindows.slice()
  const index = next.findIndex((w) => w.id === stateId)
  if (index >= 0) {
    next[index] = { ...next[index], ...patch, id: stateId }
  } else {
    next.push({ ...fallback, ...patch, id: stateId })
  }
  return next
}

export interface BoundsPatch {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

/**
 * Merge fresh window bounds into the openWindows list without clobbering
 * previously-persisted per-window state (lastFolder, paneLayout, ...).
 *
 * This replaces the buggy saveWindowState logic where the spread order was
 * reversed, so stale bounds overwrote fresh ones and window geometry never
 * updated across launches.
 */
export function mergeBounds(
  openWindows: WindowState[],
  stateId: string,
  bounds: BoundsPatch
): WindowState[] {
  return upsertWindowState(
    openWindows,
    stateId,
    {
      x: bounds.isMaximized ? undefined : bounds.x,
      y: bounds.isMaximized ? undefined : bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: bounds.isMaximized,
    },
    {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: bounds.isMaximized,
    }
  )
}

export function setWindowFolder(
  openWindows: WindowState[],
  stateId: string,
  folderPath: string,
  defaultBounds: { width: number; height: number }
): WindowState[] {
  return upsertWindowState(
    openWindows,
    stateId,
    { lastFolder: folderPath },
    {
      width: defaultBounds.width,
      height: defaultBounds.height,
      lastFolder: folderPath,
    }
  )
}

export function setWindowPaneLayout(
  openWindows: WindowState[],
  stateId: string,
  paneLayout: PaneLayoutSettings[],
  paneRows: PaneRowLayout[],
  activePaneId: string | undefined,
  defaultBounds: { width: number; height: number }
): WindowState[] {
  return upsertWindowState(
    openWindows,
    stateId,
    { paneLayout, paneRows, activePaneId },
    {
      width: defaultBounds.width,
      height: defaultBounds.height,
      paneLayout,
      paneRows,
      activePaneId,
    }
  )
}

/**
 * Append `files` to the persisted pane layout for `state`, deduplicating tabs
 * by path and keeping the last requested file as the active tab.
 *
 * Used by the file router to seed an existing window's state before the
 * renderer has finished mounting on a cold start. Without this, the
 * `open-file-path` IPC fires before the renderer registers its listener and
 * the file is silently dropped (see lexed#? — Finder cold-open regression).
 *
 * Idempotent: re-seeding the same files only updates `activeTab`.
 */
export function appendFilesToWindowPaneLayout(state: WindowState, files: string[]): WindowState {
  if (files.length === 0) return state

  const existingPanes = state.paneLayout ?? []
  const existingRows = state.paneRows ?? []

  if (existingPanes.length === 0) {
    const paneId = randomUUID()
    const rowId = randomUUID()
    return {
      ...state,
      paneLayout: [
        {
          id: paneId,
          tabs: dedupePreservingOrder(files),
          activeTab: files[files.length - 1] ?? null,
        },
      ],
      paneRows: [{ id: rowId, paneIds: [paneId] }],
      activePaneId: paneId,
    }
  }

  const targetPaneId =
    state.activePaneId && existingPanes.some((p) => p.id === state.activePaneId)
      ? state.activePaneId
      : existingPanes[0].id

  const newPanes: PaneLayoutSettings[] = existingPanes.map((pane) => {
    if (pane.id !== targetPaneId) return pane
    const seen = new Set(pane.tabs)
    const tabs = pane.tabs.slice()
    for (const f of files) {
      if (!seen.has(f)) {
        tabs.push(f)
        seen.add(f)
      }
    }
    return { ...pane, tabs, activeTab: files[files.length - 1] }
  })

  const rowsCoverTarget = existingRows.some((row) => row.paneIds.includes(targetPaneId))
  const newRows: PaneRowLayout[] = rowsCoverTarget
    ? existingRows
    : [{ id: randomUUID(), paneIds: [targetPaneId] }, ...existingRows]

  return {
    ...state,
    paneLayout: newPanes,
    paneRows: newRows,
    activePaneId: targetPaneId,
  }
}

function dedupePreservingOrder(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
  }
  return out
}
