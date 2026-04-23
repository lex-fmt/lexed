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
