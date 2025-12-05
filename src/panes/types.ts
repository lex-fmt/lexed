import type { Tab } from '@/components/TabBar';

export interface PaneState {
  id: string;
  tabs: Tab[];
  activeTabId: string | null;
  currentFile: string | null;
  cursorLine: number;
}

export interface PaneRowState {
  id: string;
  paneIds: string[];
  size?: number;
  paneSizes?: Record<string, number>;
}
