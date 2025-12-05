import { BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { randomUUID } from 'crypto';
import { LspManager } from './lsp-manager';
import Store from 'electron-store';

// Re-using types from main.ts (will be moved/shared later if needed)
// For now, defining them here to avoid circular deps or complex refactors
export interface PaneLayoutSettings {
  id: string;
  tabs: string[];
  activeTab?: string | null;
}

export interface PaneRowLayout {
  id: string;
  paneIds: string[];
  size?: number;
  paneSizes?: Record<string, number>;
}

export interface EditorSettings {
  showRuler: boolean;
  rulerWidth: number;
  vimMode: boolean;
}

export interface FormatterSettings {
  sessionBlankLinesBefore: number;
  sessionBlankLinesAfter: number;
  normalizeSeqMarkers: boolean;
  unorderedSeqMarker: string;
  maxBlankLines: number;
  indentString: string;
  preserveTrailingBlanks: boolean;
  normalizeVerbatimMarkers: boolean;
  formatOnSave: boolean;
}

export interface WindowState {
  id: string; // UUID
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
  // Per-window settings
  lastFolder?: string;
  paneLayout?: PaneLayoutSettings[];
  paneRows?: PaneRowLayout[];
  activePaneId?: string;
}

export interface SpellcheckSettings {
  enabled: boolean;
  language: string;
}

export interface AppSettings {
  openWindows?: WindowState[];
  // Global settings
  editor?: EditorSettings;
  formatter?: FormatterSettings;
  spellcheck?: SpellcheckSettings;
  // Legacy fields (for migration)
  lastFolder?: string;
  openTabs?: string[];
  activeTab?: string;
  paneLayout?: PaneLayoutSettings[];
  paneRows?: PaneRowLayout[];
  activePaneId?: string;
  windowState?: Partial<WindowState>;
}

const DEFAULT_WINDOW_STATE = {
  width: 1200,
  height: 800,
};

export class WindowManager {
  private windows: Map<number, { window: BrowserWindow; lsp: LspManager; stateId: string }> = new Map();
  private store: Store<AppSettings>;
  private isQuitting = false;

  constructor(store: Store<AppSettings>) {
    this.store = store;
  }

  public getWindow(id: number) {
    return this.windows.get(id)?.window;
  }

  public getLsp(id: number) {
    return this.windows.get(id)?.lsp;
  }

  public getWindowStateId(id: number) {
    return this.windows.get(id)?.stateId;
  }

  public getAllWindows() {
    return Array.from(this.windows.values()).map((w) => w.window);
  }

  public updateTitle(id: number, folderPath?: string) {
    const win = this.getWindow(id);
    if (!win) return;
    const title = folderPath ? `LexEd - ${path.basename(folderPath)}` : 'LexEd';
    win.setTitle(title);
  }

  public async createWindow(restoreState?: WindowState) {
    const hideWindow = process.env.LEX_HIDE_WINDOW === '1';
    const stateId = restoreState?.id || randomUUID();
    // const initialTheme = 'dark'; // TODO: Get from main.ts or pass in
    
    // Determine bounds
    const width = restoreState?.width || DEFAULT_WINDOW_STATE.width;
    const height = restoreState?.height || DEFAULT_WINDOW_STATE.height;
    const x = restoreState?.x;
    const y = restoreState?.y;

    try {
      const initialTitle = restoreState?.lastFolder 
        ? `LexEd - ${path.basename(restoreState.lastFolder)}` 
        : 'LexEd';

      const win = new BrowserWindow({
        title: initialTitle,
        // icon: ... (passed from main or hardcoded)
        x,
        y,
        width,
        height,
        show: false, // Show after ready-to-show
        backgroundColor: '#1e1e1e', // Default dark
        webPreferences: {
          preload: path.join(__dirname, 'preload.mjs'),
          backgroundThrottling: false,
        },
      });

      if (restoreState?.isMaximized) {
        win.maximize();
      }

      const lsp = new LspManager();
      lsp.setWebContents(win.webContents);
      // TODO: Start LSP with specific root if we have one
      lsp.start(); 

      this.windows.set(win.id, { window: win, lsp, stateId });

      win.once('ready-to-show', () => {
        if (!hideWindow) {
          win.show();
        }
      });

      win.on('close', () => {
        if (!this.isQuitting) {
          this.saveWindowState(win.id);
        }
      });

      win.on('closed', () => {
        lsp.stop();
        this.windows.delete(win.id);
        
        if (!this.isQuitting) {
          this.removeWindowState(stateId);
        }
        
        // We don't need to saveAllState here if we removed the specific one
        // But if we want to be safe or if saveAllState does other cleanup:
        // this.saveAllState(); 
      });

      // Load content
      const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
      const RENDERER_DIST = path.join(process.env.APP_ROOT || path.join(__dirname, '..'), 'dist');

      if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL);
      } else {
        win.loadFile(path.join(RENDERER_DIST, 'index.html'));
      }

      return win;
    } catch (error) {
      console.error('Error in createWindow:', error);
      throw error;
    }
  }

  public saveWindowState(windowId: number) {
    if (process.env.LEX_DISABLE_PERSISTENCE === '1') return;
    const entry = this.windows.get(windowId);
    if (!entry) return;

    const { window, stateId } = entry;
    if (window.isDestroyed()) return;

    const bounds = window.getBounds();
    const isMaximized = window.isMaximized();

    // We need to fetch the current pane layout from the renderer or rely on what's been pushed to store
    // For now, we assume the store is the source of truth for pane layout, updated via IPC
    // But wait, the store is global. We need to update the specific window entry in the store.
    
    const currentSettings = this.store.store;
    const openWindows = currentSettings.openWindows || [];
    const existingIndex = openWindows.findIndex(w => w.id === stateId);

    const newState: WindowState = {
      id: stateId,
      x: isMaximized ? undefined : bounds.x,
      y: isMaximized ? undefined : bounds.y,
      width: isMaximized ? DEFAULT_WINDOW_STATE.width : bounds.width,
      height: isMaximized ? DEFAULT_WINDOW_STATE.height : bounds.height,
      isMaximized,
      // Preserve existing state if present
      ...(existingIndex >= 0 ? openWindows[existingIndex] : {}),
    };

    if (existingIndex >= 0) {
      openWindows[existingIndex] = { ...openWindows[existingIndex], ...newState };
    } else {
      openWindows.push(newState);
    }

    this.store.set('openWindows', openWindows);
  }

  public removeWindowState(stateId: string) {
    if (process.env.LEX_DISABLE_PERSISTENCE === '1') return;
    
    const currentSettings = this.store.store;
    const openWindows = currentSettings.openWindows || [];
    const newOpenWindows = openWindows.filter(w => w.id !== stateId);
    
    if (newOpenWindows.length !== openWindows.length) {
      this.store.set('openWindows', newOpenWindows);
    }
  }

  public saveAllState() {
    for (const id of this.windows.keys()) {
      this.saveWindowState(id);
    }
  }

  public restoreWindows() {
    if (process.env.LEX_DISABLE_PERSISTENCE === '1') {
      this.createWindow();
      return;
    }

    const settings = this.store.store;
    const openWindows = settings.openWindows || [];

    if (openWindows.length === 0) {
      this.createWindow();
    } else {
      for (const winState of openWindows) {
        this.createWindow(winState);
      }
    }
  }

  public setQuitting(quitting: boolean) {
    this.isQuitting = quitting;
  }
}
