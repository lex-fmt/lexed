import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { PaneState, PaneRowState } from '@/panes/types';
import {
  DEFAULT_PANE_SIZE,
  MIN_ROW_SIZE,
  MIN_PANE_SIZE,
  getPaneWeight,
  getRowSize,
  normalizePaneSizes,
} from '@/panes/layout';
import { EditorPane, type EditorPaneHandle } from './EditorPane';
import type { ExportStatus } from './StatusBar';
import type { TabDropData } from './TabBar';

interface PaneWorkspaceProps {
  panes: PaneState[];
  paneRows: PaneRowState[];
  activePaneId: string | null;
  exportStatus: ExportStatus;
  registerPaneHandle: (paneId: string) => (instance: EditorPaneHandle | null) => void;
  onFocusPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onTabSelect: (paneId: string, tabId: string) => void;
  onTabClose: (paneId: string, tabId: string) => void;
  onTabDrop: (paneId: string, data: TabDropData) => void;
  onFileLoaded: (paneId: string, path: string | null) => void;
  onCursorChange: (paneId: string, line: number) => void;
  onPaneRowsChange: Dispatch<SetStateAction<PaneRowState[]>>;
}

interface RowResizeState {
  rowId: string;
  nextRowId: string;
  startY: number;
  initialFirstSize: number;
  initialSecondSize: number;
  totalRowSize: number;
  containerHeight: number;
}

interface ColumnResizeState {
  rowId: string;
  leftPaneId: string;
  rightPaneId: string;
  startX: number;
  rowWidth: number;
  initialLeftSize: number;
  initialRightSize: number;
}

export function PaneWorkspace({
  panes,
  paneRows,
  activePaneId,
  exportStatus,
  registerPaneHandle,
  onFocusPane,
  onClosePane,
  onTabSelect,
  onTabClose,
  onTabDrop,
  onFileLoaded,
  onCursorChange,
  onPaneRowsChange,
}: PaneWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement | null>());
  const [rowResize, setRowResize] = useState<RowResizeState | null>(null);
  const [columnResize, setColumnResize] = useState<ColumnResizeState | null>(null);

  const paneMap = useMemo(() => {
    const map = new Map<string, PaneState>();
    panes.forEach(pane => map.set(pane.id, pane));
    return map;
  }, [panes]);

  const startRowResize = useCallback((rowId: string, nextRowId: string, clientY: number) => {
    const row = paneRows.find(r => r.id === rowId);
    const nextRow = paneRows.find(r => r.id === nextRowId);
    if (!row || !nextRow || !workspaceRef.current) return;
    const containerHeight = workspaceRef.current.getBoundingClientRect().height || 1;
    const totalRowSize = paneRows.reduce((sum, current) => sum + getRowSize(current), 0);
    setRowResize({
      rowId,
      nextRowId,
      startY: clientY,
      initialFirstSize: getRowSize(row),
      initialSecondSize: getRowSize(nextRow),
      totalRowSize,
      containerHeight,
    });
  }, [paneRows]);

  const startColumnResize = useCallback((rowId: string, leftPaneId: string, rightPaneId: string, clientX: number) => {
    const row = paneRows.find(r => r.id === rowId);
    const rowElement = rowRefs.current.get(rowId);
    if (!row || !rowElement) return;
    const rowWidth = rowElement.getBoundingClientRect().width || 1;
    const paneSizes = normalizePaneSizes(row);
    setColumnResize({
      rowId,
      leftPaneId,
      rightPaneId,
      startX: clientX,
      rowWidth,
      initialLeftSize: paneSizes[leftPaneId] ?? DEFAULT_PANE_SIZE,
      initialRightSize: paneSizes[rightPaneId] ?? DEFAULT_PANE_SIZE,
    });
  }, [paneRows]);

  useEffect(() => {
    if (!rowResize) return;
    const handleMouseMove = (event: MouseEvent) => {
      const delta = event.clientY - rowResize.startY;
      const deltaSize = (delta / rowResize.containerHeight) * rowResize.totalRowSize;
      const pairSum = rowResize.initialFirstSize + rowResize.initialSecondSize;
      let newFirst = rowResize.initialFirstSize + deltaSize;
      newFirst = Math.max(MIN_ROW_SIZE, Math.min(newFirst, pairSum - MIN_ROW_SIZE));
      const newSecond = pairSum - newFirst;
      onPaneRowsChange(prev => prev.map(row => {
        if (row.id === rowResize.rowId) {
          return { ...row, size: newFirst };
        }
        if (row.id === rowResize.nextRowId) {
          return { ...row, size: newSecond };
        }
        return row;
      }));
    };
    const handleMouseUp = () => setRowResize(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [rowResize, onPaneRowsChange]);

  useEffect(() => {
    if (!columnResize) return;
    const handleMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - columnResize.startX;
      const total = columnResize.initialLeftSize + columnResize.initialRightSize;
      const deltaSize = (delta / columnResize.rowWidth) * total;
      let newLeft = columnResize.initialLeftSize + deltaSize;
      newLeft = Math.max(MIN_PANE_SIZE, Math.min(newLeft, total - MIN_PANE_SIZE));
      const newRight = total - newLeft;
      onPaneRowsChange(prev => prev.map(row => {
        if (row.id !== columnResize.rowId) return row;
        const paneSizes = { ...normalizePaneSizes(row) };
        paneSizes[columnResize.leftPaneId] = newLeft;
        paneSizes[columnResize.rightPaneId] = newRight;
        return { ...row, paneSizes };
      }));
    };
    const handleMouseUp = () => setColumnResize(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [columnResize, onPaneRowsChange]);

  return (
    <div className="flex flex-1 flex-col min-h-0" ref={workspaceRef}>
      {paneRows.map((row, rowIndex) => {
        const rowWeight = getRowSize(row);
        return (
          <div key={row.id} className="flex flex-col min-h-0 min-w-0" style={{ flex: `${rowWeight} 1 0` }}>
            <div
              className="flex flex-1 min-h-0 min-w-0"
              ref={(element) => {
                if (element) {
                  rowRefs.current.set(row.id, element);
                } else {
                  rowRefs.current.delete(row.id);
                }
              }}
              data-testid="pane-row"
              data-row-id={row.id}
              data-row-index={rowIndex}
            >
              {row.paneIds.map((paneId, paneIndex) => {
                const pane = paneMap.get(paneId);
                if (!pane) return null;
                const paneWeight = getPaneWeight(row, paneId);
                return (
                  <div key={pane.id} className="flex h-full min-w-0" style={{ flex: `${paneWeight} 1 0` }}>
                    <div
                      data-testid="editor-pane"
                      data-pane-index={paneIndex}
                      data-pane-id={pane.id}
                      data-active={pane.id === activePaneId}
                      className="relative flex flex-1 flex-col min-w-0"
                      onMouseDown={() => onFocusPane(pane.id)}
                    >
                      <button
                        className="absolute top-1 right-1 z-10 px-1 text-xs text-muted-foreground hover:text-foreground"
                        title="Close pane"
                        disabled={panes.length <= 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (panes.length > 1) {
                            onClosePane(pane.id);
                          }
                        }}
                      >
                        ×
                      </button>
                      <EditorPane
                        ref={registerPaneHandle(pane.id)}
                        tabs={pane.tabs}
                        activeTabId={pane.activeTabId}
                        paneId={pane.id}
                        onTabSelect={(tabId) => onTabSelect(pane.id, tabId)}
                        onTabClose={(tabId) => onTabClose(pane.id, tabId)}
                        onTabDrop={(data) => onTabDrop(pane.id, data)}
                        onFileLoaded={(path) => onFileLoaded(pane.id, path)}
                        onCursorChange={(line) => onCursorChange(pane.id, line)}
                        onActivate={() => onFocusPane(pane.id)}
                        exportStatus={exportStatus}
                      />
                    </div>
                    {paneIndex < row.paneIds.length - 1 && (
                      <div
                        className="w-1 cursor-col-resize bg-border hover:bg-accent"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          startColumnResize(row.id, pane.id, row.paneIds[paneIndex + 1], event.clientX);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {rowIndex < paneRows.length - 1 && (
              <div
                className="h-1 cursor-row-resize bg-border hover:bg-accent"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  startRowResize(row.id, paneRows[rowIndex + 1].id, event.clientY);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
