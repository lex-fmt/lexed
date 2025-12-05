import type { PaneRowState } from './types';

export const DEFAULT_ROW_SIZE = 1;
export const DEFAULT_PANE_SIZE = 1;
export const MIN_ROW_SIZE = 0.1;
export const MIN_PANE_SIZE = 0.1;

export const getRowSize = (row: PaneRowState): number => (
  row.size && row.size > 0 ? row.size : DEFAULT_ROW_SIZE
);

export const normalizePaneSizes = (
  row: PaneRowState,
  overridePaneIds?: string[],
): Record<string, number> => {
  const normalized: Record<string, number> = {};
  const paneIds = overridePaneIds ?? row.paneIds;
  if (paneIds.length === 0) {
    return normalized;
  }

  let total = 0;
  paneIds.forEach(id => {
    const value = row.paneSizes?.[id];
    const safeValue = value && value > 0 ? value : DEFAULT_PANE_SIZE;
    normalized[id] = safeValue;
    total += safeValue;
  });

  if (total <= 0) {
    paneIds.forEach(id => {
      normalized[id] = DEFAULT_PANE_SIZE;
    });
    total = paneIds.length * DEFAULT_PANE_SIZE;
  }

  const targetTotal = paneIds.length * DEFAULT_PANE_SIZE;
  paneIds.forEach(id => {
    normalized[id] = (normalized[id] / total) * targetTotal;
  });

  return normalized;
};

export const getPaneWeight = (row: PaneRowState, paneId: string): number => {
  const value = row.paneSizes?.[paneId];
  return value && value > 0 ? value : DEFAULT_PANE_SIZE;
};

export const withRowDefaults = (row: PaneRowState): PaneRowState => ({
  id: row.id,
  paneIds: [...row.paneIds],
  size: row.size && row.size > 0 ? row.size : DEFAULT_ROW_SIZE,
  paneSizes: normalizePaneSizes(row),
});
