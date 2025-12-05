/* eslint-disable @typescript-eslint/no-explicit-any */
import { ipcRenderer, contextBridge } from 'electron';
import type { IpcRendererEvent } from 'electron';

const initialTheme = ipcRenderer.sendSync('get-native-theme-sync') as 'dark' | 'light';

const applyThemeAttribute = (mode: 'dark' | 'light') => {
  if (typeof document === 'undefined') {
    return false;
  }
  const root = document.documentElement;
  if (root) {
    root.setAttribute('data-theme', mode);
    return true;
  }
  return false;
};

if (!applyThemeAttribute(initialTheme) && typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    applyThemeAttribute(initialTheme);
  }, { once: true });
}

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    const subscription = (event: IpcRendererEvent, ...listenerArgs: unknown[]) => listener(event, ...listenerArgs)
    ipcRenderer.on(channel, subscription)
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
  fileNew: (defaultPath?: string) => ipcRenderer.invoke('file-new', defaultPath) as Promise<{ filePath: string, content: string } | null>,
  fileOpen: () => ipcRenderer.invoke('file-open'),
  fileSave: (filePath: string, content: string) => ipcRenderer.invoke('file-save', filePath, content),
  fileReadDir: (dirPath: string) => ipcRenderer.invoke('file-read-dir', dirPath),
  fileRead: (filePath: string) => ipcRenderer.invoke('file-read', filePath),
  fileChecksum: (filePath: string) => ipcRenderer.invoke('file-checksum', filePath) as Promise<string | null>,
  folderOpen: () => ipcRenderer.invoke('folder-open'),
  getInitialFolder: () => ipcRenderer.invoke('get-initial-folder'),
  setLastFolder: (folderPath: string) => ipcRenderer.invoke('set-last-folder', folderPath),
  loadTestFixture: (fixtureName: string) => ipcRenderer.invoke('test-load-fixture', fixtureName) as Promise<{ path: string; content: string }>,
  getNativeTheme: () => ipcRenderer.invoke('get-native-theme'),
  onNativeThemeChanged: (callback: (theme: 'dark' | 'light') => void) => {
    const handler = (_event: IpcRendererEvent, theme: 'dark' | 'light') => callback(theme);
    ipcRenderer.on('native-theme-changed', handler);
    return () => ipcRenderer.removeListener('native-theme-changed', handler);
  },
  getOpenTabs: () => ipcRenderer.invoke('get-open-tabs') as Promise<{
    panes: Array<{ id: string; tabs: string[]; activeTab: string | null }>;
    activePaneId: string | null;
    rows: Array<{ id: string; paneIds: string[]; size?: number; paneSizes?: Record<string, number> }>;
  }>,
  setOpenTabs: (
    panes: Array<{ id: string; tabs: string[]; activeTab: string | null }>,
    rows: Array<{ id: string; paneIds: string[]; size?: number; paneSizes?: Record<string, number> }>,
    activePaneId: string | null
  ) => ipcRenderer.invoke('set-open-tabs', panes, rows, activePaneId),
  updateMenuState: (state: { hasOpenFile: boolean; isLexFile: boolean }) => ipcRenderer.send('update-menu-state', state),
  onMenuNewFile: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-new-file', handler);
    return () => ipcRenderer.removeListener('menu-new-file', handler);
  },
  onMenuOpenFile: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-open-file', handler);
    return () => ipcRenderer.removeListener('menu-open-file', handler);
  },
  onMenuOpenFolder: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-open-folder', handler);
    return () => ipcRenderer.removeListener('menu-open-folder', handler);
  },
  onMenuSave: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-save', handler);
    return () => ipcRenderer.removeListener('menu-save', handler);
  },
  onMenuFormat: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-format', handler);
    return () => ipcRenderer.removeListener('menu-format', handler);
  },
  onMenuExport: (callback: (format: string) => void) => {
    const handler = (_event: IpcRendererEvent, format: string) => callback(format);
    ipcRenderer.on('menu-export', handler);
    return () => ipcRenderer.removeListener('menu-export', handler);
  },
  shareWhatsApp: (content: string) => ipcRenderer.invoke('share-whatsapp', content) as Promise<void>,
  showItemInFolder: (fullPath: string) => ipcRenderer.invoke('show-item-in-folder', fullPath),
  onMenuFind: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-find', handler);
    return () => ipcRenderer.removeListener('menu-find', handler);
  },
  onMenuReplace: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-replace', handler);
    return () => ipcRenderer.removeListener('menu-replace', handler);
  },
  onMenuSplitVertical: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-split-vertical', handler);
    return () => ipcRenderer.removeListener('menu-split-vertical', handler);
  },
  onMenuSplitHorizontal: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-split-horizontal', handler);
    return () => ipcRenderer.removeListener('menu-split-horizontal', handler);
  },
  onMenuPreview: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-preview', handler);
    return () => ipcRenderer.removeListener('menu-preview', handler);
  },
  onOpenFilePath: (callback: (filePath: string) => void) => {
    const handler = (_event: IpcRendererEvent, filePath: string) => callback(filePath);
    ipcRenderer.on('open-file-path', handler);
    return () => ipcRenderer.removeListener('open-file-path', handler);
  },
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  setEditorSettings: (settings: { showRuler: boolean; rulerWidth: number; vimMode: boolean }) => ipcRenderer.invoke('set-editor-settings', settings),
  setFormatterSettings: (
    settings: {
      sessionBlankLinesBefore: number;
      sessionBlankLinesAfter: number;
      normalizeSeqMarkers: boolean;
      unorderedSeqMarker: string;
      maxBlankLines: number;
      indentString: string;
      preserveTrailingBlanks: boolean;
      formatOnSave: boolean;
    }
  ) => ipcRenderer.invoke('set-formatter-settings', settings),
  setSpellcheckSettings: (settings: { enabled: boolean; language: string }) => ipcRenderer.invoke('set-spellcheck-settings', settings),
  onSettingsChanged: (callback: (settings: any) => void) => {
    const handler = (_event: IpcRendererEvent, settings: any) => callback(settings);
    ipcRenderer.on('settings-changed', handler);
    return () => ipcRenderer.removeListener('settings-changed', handler);
  },
})
