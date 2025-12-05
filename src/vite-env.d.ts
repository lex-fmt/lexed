/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="vite/client" />

interface Window {
  ipcRenderer: {
    on(channel: string, func: (...args: unknown[]) => void): () => void;
    off(channel: string, func: (...args: unknown[]) => void): void;
    send(channel: string, ...args: unknown[]): void;
    invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
    fileNew(defaultPath?: string): Promise<{ filePath: string, content: string } | null>;
    fileOpen(): Promise<{ filePath: string, content: string } | null>;
    fileSave(filePath: string, content: string): Promise<boolean>;
    fileReadDir(dirPath: string): Promise<Array<{ name: string, isDirectory: boolean, path: string }>>;
    fileRead(filePath: string): Promise<string | null>;
    fileChecksum(filePath: string): Promise<string | null>;
    folderOpen(): Promise<string | null>;
    getInitialFolder: () => Promise<string>;
    setLastFolder: (folderPath: string) => Promise<boolean>;
    loadTestFixture: (fixtureName: string) => Promise<{ path: string; content: string }>;
    getNativeTheme: () => Promise<'dark' | 'light'>;
    onNativeThemeChanged: (callback: (theme: 'dark' | 'light') => void) => () => void;
    getOpenTabs: () => Promise<{
      panes: Array<{ id: string; tabs: string[]; activeTab: string | null }>;
      activePaneId: string | null;
      rows: Array<{ id: string; paneIds: string[]; size?: number; paneSizes?: Record<string, number> }>;
    }>;
    setOpenTabs: (
      panes: Array<{ id: string; tabs: string[]; activeTab: string | null }>,
      rows: Array<{ id: string; paneIds: string[]; size?: number; paneSizes?: Record<string, number> }>,
      activePaneId: string | null
    ) => Promise<boolean>;
    updateMenuState: (state: { hasOpenFile: boolean; isLexFile: boolean }) => void;
    onMenuNewFile: (callback: () => void) => () => void;
    onMenuOpenFile: (callback: () => void) => () => void;
    onMenuOpenFolder: (callback: () => void) => () => void;
    onMenuSave: (callback: () => void) => () => void;
    onMenuFormat: (callback: () => void) => () => void;
    onMenuExport: (callback: (format: string) => void) => () => void;
    shareWhatsApp: (content: string) => Promise<void>;
    showItemInFolder: (fullPath: string) => Promise<void>;
    onMenuFind: (callback: () => void) => () => void;
    onMenuReplace: (callback: () => void) => () => void;
    onMenuSplitVertical: (callback: () => void) => () => void;
    onMenuSplitHorizontal: (callback: () => void) => () => void;
    onMenuPreview: (callback: () => void) => () => void;
    onOpenFilePath: (callback: (filePath: string) => void) => () => void;
    getAppSettings: () => Promise<any>;
    setEditorSettings: (settings: { showRuler: boolean; rulerWidth: number; vimMode: boolean }) => Promise<boolean>;
    setFormatterSettings: (settings: {
      sessionBlankLinesBefore: number;
      sessionBlankLinesAfter: number;
      normalizeSeqMarkers: boolean;
      unorderedSeqMarker: string;
      maxBlankLines: number;
      indentString: string;
      preserveTrailingBlanks: boolean;
      normalizeVerbatimMarkers: boolean;
      formatOnSave: boolean;
    }) => Promise<boolean>;
    setSpellcheckSettings: (settings: { enabled: boolean; language: string }) => Promise<boolean>;
    onSettingsChanged: (callback: (settings: any) => void) => () => void;
  }
  lexTest?: {
    openFixture: (fixtureName: string, paneId?: string | null) => Promise<{ path: string; content: string }>;
    readFixture: (fixtureName: string) => Promise<{ path: string; content: string }>;
    getActiveEditorValue: () => string;
    triggerMockDiagnostics: () => boolean;
    setActiveEditorValue?: (value: string) => boolean;
    resetFormattingRequest?: () => void;
    getLastFormattingRequest?: () => { type: 'document' | 'range'; params: unknown } | null;
    notifyFormattingRequest?: (payload: { type: 'document' | 'range'; params: unknown }) => void;
  };
}
