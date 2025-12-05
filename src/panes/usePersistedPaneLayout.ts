import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { PaneState, PaneRowState } from './types';
import { DEFAULT_PANE_SIZE, DEFAULT_ROW_SIZE, withRowDefaults } from './layout';
import type { Tab } from '@/components/TabBar';

const createPaneIdValue = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `pane-${Math.random().toString(36).slice(2, 9)}`;
};

const createRowIdValue = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `row-${Math.random().toString(36).slice(2, 9)}`;
};

export const createPaneId = () => createPaneIdValue();
export const createRowId = () => createRowIdValue();

export const createEmptyPane = (id?: string): PaneState => ({
  id: id || createPaneIdValue(),
  tabs: [],
  activeTabId: null,
  currentFile: null,
  cursorLine: 0,
});

interface DefaultLayout {
  panes: PaneState[];
  rows: PaneRowState[];
  activePaneId: string;
}

interface SavedPaneRow {
  id?: string;
  paneIds?: string[];
  size?: number;
  paneSizes?: Record<string, number>;
}

interface PersistedPaneLayoutResult {
  panes: PaneState[];
  paneRows: PaneRowState[];
  activePaneId: string;
  setPanes: Dispatch<SetStateAction<PaneState[]>>;
  setPaneRows: Dispatch<SetStateAction<PaneRowState[]>>;
  setActivePaneId: Dispatch<SetStateAction<string>>;
  layoutInitialized: boolean;
  resolvedActivePane: PaneState | null;
  resolvedActivePaneId: string | null;
}

const hydrateSavedRows = (savedRows: SavedPaneRow[], paneIdSet: Set<string>): PaneRowState[] => {
  const rows: PaneRowState[] = savedRows
    .map((row) => ({
      id: row.id || createRowIdValue(),
      paneIds: Array.isArray(row.paneIds)
        ? row.paneIds.filter((id: string) => paneIdSet.has(id))
        : [],
      size: typeof row.size === 'number' ? row.size : undefined,
      paneSizes: row.paneSizes && typeof row.paneSizes === 'object'
        ? row.paneSizes
        : undefined,
    }))
    .filter(row => row.paneIds.length > 0);

  return rows;
};

const buildDefaultLayout = (): DefaultLayout => {
  const first = createEmptyPane();
  const second = createEmptyPane();
  const initialRowId = createRowIdValue();
  return {
    panes: [first, second],
    rows: [{
      id: initialRowId,
      paneIds: [first.id, second.id],
      size: DEFAULT_ROW_SIZE,
      paneSizes: {
        [first.id]: DEFAULT_PANE_SIZE,
        [second.id]: DEFAULT_PANE_SIZE,
      },
    }],
    activePaneId: first.id,
  };
};

export function usePersistedPaneLayout(createTabFromPath: (path: string) => Tab): PersistedPaneLayoutResult {
  const defaultLayoutRef = useRef<DefaultLayout | null>(null);
  if (!defaultLayoutRef.current) {
    defaultLayoutRef.current = buildDefaultLayout();
  }

  const [panes, setPanes] = useState<PaneState[]>(() => defaultLayoutRef.current!.panes);
  const [paneRows, setPaneRows] = useState<PaneRowState[]>(() => defaultLayoutRef.current!.rows.map(withRowDefaults));
  const [activePaneId, setActivePaneId] = useState<string>(() => defaultLayoutRef.current!.activePaneId);
  const [layoutInitialized, setLayoutInitialized] = useState(false);

  useEffect(() => {
    const loadLayout = async () => {
      try {
        const layout = await window.ipcRenderer.getOpenTabs();
        if (layout && Array.isArray(layout.panes) && layout.panes.length > 0) {
          const hydrated = layout.panes.map<PaneState>((pane) => ({
            id: pane.id || createPaneIdValue(),
            tabs: pane.tabs.map(createTabFromPath),
            activeTabId: pane.activeTab && pane.tabs.includes(pane.activeTab)
              ? pane.activeTab
              : pane.tabs[0] || null,
            currentFile: null,
            cursorLine: 0,
          }));

          if (hydrated.length === 1) {
            hydrated.push(createEmptyPane());
          }

          const paneIdSet = new Set(hydrated.map(p => p.id));
          const rowData = Array.isArray(layout.rows) ? layout.rows : [];
          let rows = hydrateSavedRows(rowData, paneIdSet);

          const referencedIds = new Set(rows.flatMap(row => row.paneIds));
          const unreferenced = hydrated
            .map(p => p.id)
            .filter(id => !referencedIds.has(id));

          if (rows.length === 0) {
            rows = [withRowDefaults({ id: createRowIdValue(), paneIds: hydrated.map(p => p.id) })];
          } else if (unreferenced.length > 0) {
            rows[0] = {
              ...rows[0],
              paneIds: [...rows[0].paneIds, ...unreferenced],
            };
          }

          setPanes(hydrated);
          setPaneRows(rows.map(withRowDefaults));

          const savedActiveId = layout.activePaneId && hydrated.some(p => p.id === layout.activePaneId)
            ? layout.activePaneId
            : rows[0]?.paneIds[0] ?? hydrated[0]?.id;
          if (savedActiveId) {
            setActivePaneId(savedActiveId);
          }
        }
      } catch (error) {
        console.error('Failed to load pane layout:', error);
      } finally {
        setLayoutInitialized(true);
      }
    };

    loadLayout();
  }, [createTabFromPath]);

  const resolvedActivePane = useMemo(() => {
    return panes.find(pane => pane.id === activePaneId) ?? panes[0] ?? null;
  }, [panes, activePaneId]);

  const resolvedActivePaneId = resolvedActivePane?.id ?? null;

  useEffect(() => {
    if (!layoutInitialized) return;
    const persist = async () => {
      try {
        const payload = panes.map(pane => ({
          id: pane.id,
          tabs: pane.tabs.map(tab => tab.path),
          activeTab: pane.activeTabId,
        }));
        const rowsPayload = paneRows.map(row => ({
          id: row.id,
          paneIds: row.paneIds.filter(id => panes.some(p => p.id === id)),
          size: row.size,
          paneSizes: row.paneSizes,
        }));
        await window.ipcRenderer.setOpenTabs(payload, rowsPayload, resolvedActivePaneId);
      } catch (error) {
        console.error('Failed to persist pane layout:', error);
      }
    };
    persist();
  }, [panes, paneRows, resolvedActivePaneId, layoutInitialized]);

  useEffect(() => {
    if (!panes.length) return;
    if (!panes.some(pane => pane.id === activePaneId)) {
      setActivePaneId(panes[0].id);
    }
  }, [panes, activePaneId]);

  return {
    panes,
    paneRows,
    activePaneId,
    setPanes,
    setPaneRows,
    setActivePaneId,
    layoutInitialized,
    resolvedActivePane,
    resolvedActivePaneId,
  };
}
