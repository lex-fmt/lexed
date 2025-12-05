import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { PaneState, PaneRowState } from './types';
import { createEmptyPane, createRowId } from './usePersistedPaneLayout';
import { DEFAULT_PANE_SIZE, MIN_PANE_SIZE, MIN_ROW_SIZE, getRowSize, normalizePaneSizes, withRowDefaults } from './layout';
import type { Tab, TabDropData } from '@/components/TabBar';

interface UsePaneManagerOptions {
  activePaneId: string | null;
  setActivePaneId: Dispatch<SetStateAction<string>>;
  setPanes: Dispatch<SetStateAction<PaneState[]>>;
  setPaneRows: Dispatch<SetStateAction<PaneRowState[]>>;
  createTabFromPath: (path: string) => Tab;
}

export function usePaneManager({
  activePaneId,
  setActivePaneId,
  setPanes,
  setPaneRows,
  createTabFromPath,
}: UsePaneManagerOptions) {
  const focusPane = useCallback((paneId: string) => {
    setActivePaneId(paneId);
  }, [setActivePaneId]);

  const updateRowsAfterPaneRemoval = useCallback((paneId: string, remainingPaneIds: string[]) => {
    setPaneRows(prevRows => {
      let removedRowSize = 0;
      let removedIndex = -1;
      const updatedRows: PaneRowState[] = [];

      prevRows.forEach((row, index) => {
        if (!row.paneIds.includes(paneId)) {
          updatedRows.push(row);
          return;
        }

        const paneIds = row.paneIds.filter(id => id !== paneId);
        if (paneIds.length === 0) {
          removedRowSize += getRowSize(row);
          removedIndex = index;
          return;
        }

        const paneSizes = normalizePaneSizes(row, paneIds);
        updatedRows.push({ ...row, paneIds, paneSizes });
      });

      let rows = updatedRows;

      if (rows.length === 0) {
        if (remainingPaneIds.length > 0) {
          rows = [withRowDefaults({ id: createRowId(), paneIds: [remainingPaneIds[0]] })];
        } else {
          rows = [withRowDefaults({ id: createRowId(), paneIds: [] })];
        }
      }

      if (removedRowSize > 0 && rows.length > 0) {
        const targetIndex = Math.min(
          removedIndex >= 0 ? Math.min(removedIndex, rows.length - 1) : rows.length - 1,
          rows.length - 1
        );
        rows = rows.map((row, idx) => (
          idx === targetIndex ? { ...row, size: getRowSize(row) + removedRowSize } : row
        ));
      }

      return rows.map(withRowDefaults);
    });
  }, [setPaneRows]);

  const handleSplitVertical = useCallback(() => {
    if (!activePaneId) return;
    const newPane = createEmptyPane();
    setPanes(prev => [...prev, newPane]);
    setPaneRows(prevRows => {
      if (prevRows.length === 0) {
        return [withRowDefaults({ id: createRowId(), paneIds: [newPane.id] })];
      }
      let handled = false;
      const next = prevRows.map(row => {
        if (!row.paneIds.includes(activePaneId)) {
          return row;
        }
        handled = true;
        const paneIds = [...row.paneIds];
        const insertIndex = paneIds.indexOf(activePaneId);
        paneIds.splice(insertIndex + 1, 0, newPane.id);
        const paneSizes = normalizePaneSizes(row, paneIds);
        const currentWeight = paneSizes[activePaneId];
        const splitWeight = Math.max(currentWeight / 2, MIN_PANE_SIZE);
        paneSizes[activePaneId] = splitWeight;
        paneSizes[newPane.id] = splitWeight;
        return { ...row, paneIds, paneSizes };
      });
      if (!handled) {
        return [...next, withRowDefaults({ id: createRowId(), paneIds: [newPane.id] })];
      }
      return next;
    });
    setActivePaneId(newPane.id);
  }, [activePaneId, setActivePaneId, setPaneRows, setPanes]);

  const handleSplitHorizontal = useCallback(() => {
    if (!activePaneId) return;
    const newPane = createEmptyPane();
    setPanes(prev => [...prev, newPane]);
    setPaneRows(prevRows => {
      if (prevRows.length === 0) {
        return [
          withRowDefaults({ id: createRowId(), paneIds: [activePaneId] }),
          withRowDefaults({ id: createRowId(), paneIds: [newPane.id] }),
        ];
      }
      let handled = false;
      const next: PaneRowState[] = [];
      prevRows.forEach(row => {
        if (!row.paneIds.includes(activePaneId) || handled) {
          next.push(row);
          return;
        }
        handled = true;
        const rowSize = Math.max(getRowSize(row) / 2, MIN_ROW_SIZE);
        const paneSizes = normalizePaneSizes(row);
        next.push({ ...row, size: rowSize, paneSizes });
        next.push(
          withRowDefaults({
            id: createRowId(),
            paneIds: [newPane.id],
            size: rowSize,
            paneSizes: { [newPane.id]: DEFAULT_PANE_SIZE },
          })
        );
      });
      if (!handled) {
        next.push(withRowDefaults({ id: createRowId(), paneIds: [newPane.id] }));
      }
      return next;
    });
    setActivePaneId(newPane.id);
  }, [activePaneId, setActivePaneId, setPaneRows, setPanes]);

  const handleClosePane = useCallback((paneId: string) => {
    setPanes(prev => {
      if (prev.length <= 1) {
        return prev;
      }
      const filtered = prev.filter(pane => pane.id !== paneId);
      if (filtered.length === prev.length) {
        return prev;
      }
      updateRowsAfterPaneRemoval(paneId, filtered.map(p => p.id));
      if (!filtered.some(pane => pane.id === activePaneId)) {
        setActivePaneId(filtered[0]?.id ?? null);
      }
      return filtered;
    });
  }, [activePaneId, setActivePaneId, setPanes, updateRowsAfterPaneRemoval]);

  const openFileInPane = useCallback((paneId: string, path: string) => {
    let resolvedId: string | null = null;
    setPanes(prev => {
      if (prev.length === 0) {
        const newPane = createEmptyPane();
        const newTab = createTabFromPath(path);
        resolvedId = newPane.id;
        return [{ ...newPane, tabs: [newTab], activeTabId: newTab.id }];
      }
      resolvedId = prev.some(pane => pane.id === paneId) ? paneId : prev[0].id;
      return prev.map(pane => {
        if (pane.id !== resolvedId) return pane;
        const existingTab = pane.tabs.find(tab => tab.path === path);
        if (existingTab) {
          return { ...pane, activeTabId: existingTab.id };
        }
        const newTab = createTabFromPath(path);
        return { ...pane, tabs: [...pane.tabs, newTab], activeTabId: newTab.id };
      });
    });
    if (resolvedId) {
      setActivePaneId(resolvedId);
    }
  }, [setActivePaneId, setPanes, createTabFromPath]);

  const handleTabSelect = useCallback((paneId: string, tabId: string) => {
    setPanes(prev => prev.map(pane => (
      pane.id === paneId ? { ...pane, activeTabId: tabId } : pane
    )));
    setActivePaneId(paneId);
  }, [setActivePaneId, setPanes]);

  const handleTabClose = useCallback((paneId: string, tabId: string) => {
    setPanes(prev => {
      let removePane = false;
      const next = prev.map(pane => {
        if (pane.id !== paneId) return pane;
        const tabIndex = pane.tabs.findIndex(tab => tab.id === tabId);
        if (tabIndex === -1) return pane;
        const remainingTabs = pane.tabs.filter(tab => tab.id !== tabId);
        let nextActiveId = pane.activeTabId;
        if (pane.activeTabId === tabId) {
          nextActiveId = remainingTabs.length > 0
            ? remainingTabs[Math.min(tabIndex, remainingTabs.length - 1)].id
            : null;
        }
        const updatedPane: PaneState = {
          ...pane,
          tabs: remainingTabs,
          activeTabId: nextActiveId,
          currentFile: remainingTabs.length === 0 ? null : pane.currentFile,
          cursorLine: remainingTabs.length === 0 ? 0 : pane.cursorLine,
        };
        if (remainingTabs.length === 0 && prev.length > 1) {
          removePane = true;
        }
        return updatedPane;
      });
      if (removePane) {
        const filtered = next.filter(pane => pane.id !== paneId);
        updateRowsAfterPaneRemoval(paneId, filtered.map(p => p.id));
        return filtered;
      }
      return next;
    });
  }, [setPanes, updateRowsAfterPaneRemoval]);

  const handleTabDrop = useCallback((targetPaneId: string, data: TabDropData) => {
    const { tabPath, sourcePaneId, duplicate } = data;

    setPanes(prev => {
      const targetPane = prev.find(p => p.id === targetPaneId);
      const sourcePane = prev.find(p => p.id === sourcePaneId);
      if (!targetPane || !sourcePane) return prev;

      const existingTab = targetPane.tabs.find(t => t.path === tabPath);
      if (existingTab) {
        return prev.map(pane =>
          pane.id === targetPaneId
            ? { ...pane, activeTabId: existingTab.id }
            : pane
        );
      }

      const newTab = createTabFromPath(tabPath);

      let result = prev.map(pane => {
        if (pane.id === targetPaneId) {
          return {
            ...pane,
            tabs: [...pane.tabs, newTab],
            activeTabId: newTab.id,
          };
        }
        if (pane.id === sourcePaneId && !duplicate) {
          const remainingTabs = pane.tabs.filter(t => t.path !== tabPath);
          let nextActiveId = pane.activeTabId;
          if (pane.activeTabId === tabPath) {
            const tabIndex = pane.tabs.findIndex(t => t.path === tabPath);
            nextActiveId = remainingTabs.length > 0
              ? remainingTabs[Math.min(tabIndex, remainingTabs.length - 1)].id
              : null;
          }
          return {
            ...pane,
            tabs: remainingTabs,
            activeTabId: nextActiveId,
            currentFile: remainingTabs.length === 0 ? null : pane.currentFile,
            cursorLine: remainingTabs.length === 0 ? 0 : pane.cursorLine,
          };
        }
        return pane;
      });

      if (!duplicate) {
        const updatedSource = result.find(p => p.id === sourcePaneId);
        if (updatedSource && updatedSource.tabs.length === 0 && result.length > 1) {
          result = result.filter(p => p.id !== sourcePaneId);
          updateRowsAfterPaneRemoval(sourcePaneId, result.map(p => p.id));
        }
      }

      return result;
    });

    setActivePaneId(targetPaneId);
  }, [setActivePaneId, setPanes, updateRowsAfterPaneRemoval, createTabFromPath]);

  const handlePaneFileLoaded = useCallback((paneId: string, path: string | null) => {
    setPanes(prev => prev.map(pane => (
      pane.id === paneId ? { ...pane, currentFile: path } : pane
    )));
  }, [setPanes]);

  const handlePaneCursorChange = useCallback((paneId: string, line: number) => {
    setPanes(prev => prev.map(pane => (
      pane.id === paneId ? { ...pane, cursorLine: line } : pane
    )));
  }, [setPanes]);

  return {
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
  };
}
