import type { Dispatch, SetStateAction } from 'react';
import type { PaneRowState, PaneState } from '@/panes/types';
import { createEmptyPane, createRowId } from '@/panes/usePersistedPaneLayout';
import { MIN_PANE_SIZE, normalizePaneSizes, withRowDefaults } from '@/panes/layout';
import type { Tab } from '@/components/TabBar';

export type PreviewTab = Tab & { type: 'preview'; previewContent: string; sourceFile: string };

export const createPreviewTab = (sourceFile: string, content: string): PreviewTab => {
  const fileName = sourceFile.split('/').pop() || sourceFile;
  const previewId = `preview:${sourceFile}`;
  return {
    id: previewId,
    path: previewId,
    name: `Preview: ${fileName}`,
    type: 'preview',
    previewContent: content,
    sourceFile,
  };
};

interface PreviewWorkspaceOptions {
  activePaneId: string;
  panes: PaneState[];
  previewTab: PreviewTab;
  setPanes: Dispatch<SetStateAction<PaneState[]>>;
  setPaneRows: Dispatch<SetStateAction<PaneRowState[]>>;
  setActivePaneId: Dispatch<SetStateAction<string>>;
}

export function placePreviewTab({
  activePaneId,
  panes,
  previewTab,
  setPanes,
  setPaneRows,
  setActivePaneId,
}: PreviewWorkspaceOptions) {
  if (panes.length === 1) {
    const newPane = createEmptyPane();
    setPanes(prev => [...prev, { ...newPane, tabs: [previewTab], activeTabId: previewTab.id }]);
    setPaneRows(prevRows => {
      if (prevRows.length === 0) {
        return [withRowDefaults({ id: createRowId(), paneIds: [activePaneId, newPane.id] })];
      }
      return prevRows.map(row => {
        if (!row.paneIds.includes(activePaneId)) return row;
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
    });
    setActivePaneId(newPane.id);
    return;
  }

  const activeIndex = panes.findIndex(pane => pane.id === activePaneId);
  const targetIndex = activeIndex === panes.length - 1 ? 0 : activeIndex + 1;
  const targetPaneId = panes[targetIndex].id;

  setPanes(prev => prev.map(pane => {
    if (pane.id !== targetPaneId) return pane;
    const existingPreview = pane.tabs.find(tab => tab.id === previewTab.id);
    if (existingPreview) {
      return {
        ...pane,
        tabs: pane.tabs.map(tab => (tab.id === previewTab.id ? previewTab : tab)),
        activeTabId: previewTab.id,
      };
    }
    return {
      ...pane,
      tabs: [...pane.tabs, previewTab],
      activeTabId: previewTab.id,
    };
  }));
  setActivePaneId(targetPaneId);
}
