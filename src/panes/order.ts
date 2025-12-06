import type { PaneRowState, PaneState } from './types'

export interface PaneOrderItem {
  pane: PaneState
  rowIndex: number
  columnIndex: number
}

export interface TabOrderItem {
  paneId: string
  tabId: string
  paneIndex: number
  rowIndex: number
}

function getPaneMap(panes: PaneState[]): Map<string, PaneState> {
  const map = new Map<string, PaneState>()
  for (const pane of panes) {
    map.set(pane.id, pane)
  }
  return map
}

export function getVisualPaneOrder(paneRows: PaneRowState[], panes: PaneState[]): PaneOrderItem[] {
  const map = getPaneMap(panes)
  const ordered: PaneOrderItem[] = []
  paneRows.forEach((row, rowIndex) => {
    row.paneIds.forEach((paneId, columnIndex) => {
      const pane = map.get(paneId)
      if (pane) {
        ordered.push({ pane, rowIndex, columnIndex })
      }
    })
  })
  if (ordered.length !== panes.length) {
    panes.forEach((pane) => {
      if (!ordered.some((entry) => entry.pane.id === pane.id)) {
        ordered.push({ pane, rowIndex: paneRows.length, columnIndex: ordered.length })
      }
    })
  }
  return ordered
}

export function getVisualTabOrder(paneRows: PaneRowState[], panes: PaneState[]): TabOrderItem[] {
  const paneOrder = getVisualPaneOrder(paneRows, panes)
  const order: TabOrderItem[] = []
  paneOrder.forEach(({ pane, rowIndex }, paneIndex) => {
    pane.tabs.forEach((tab) => {
      order.push({ paneId: pane.id, tabId: tab.id, paneIndex, rowIndex })
    })
  })
  return order
}
