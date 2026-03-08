/**
 * Electron Platform Adapter
 *
 * Implements the PlatformAdapter interface for the Electron desktop environment.
 * All operations delegate to window.ipcRenderer which communicates with the
 * main process via IPC.
 *
 * ## Design Notes
 *
 * This adapter serves as the reference implementation. It demonstrates how to:
 * - Map platform-agnostic interfaces to Electron-specific APIs
 * - Handle the async boundary between renderer and main process
 * - Provide consistent error handling and null-safety
 *
 * ## IPC Architecture
 *
 * The renderer process cannot access Node.js APIs directly. Instead:
 * 1. Preload script exposes ipcRenderer methods via contextBridge
 * 2. This adapter calls those exposed methods
 * 3. Main process handles the IPC and performs actual operations
 *
 * @see PlatformAdapter - Interface definition in @lex/shared
 * @see preload.ts - Exposed IPC methods
 */

import type {
  PlatformAdapter,
  FileSystemAdapter,
  ThemeAdapter,
  SettingsAdapter,
  LspAdapter,
  LspTransport,
  LspStatus,
  PersistenceAdapter,
  CommandsAdapter,
  ToastAdapter,
  ThemeMode,
  OpenFileResult,
  DirEntry,
  AppSettings,
  EditorSettings,
  FormatterSettings,
  SpellcheckSettings,
  PaneLayout,
  Unsubscribe,
} from '@lex/shared'
import { IpcMessageReader, IpcMessageWriter } from '@/lsp/ipc-connection'

// ============================================================================
// File System Adapter
// ============================================================================

const fileSystemAdapter: FileSystemAdapter = {
  async read(path: string): Promise<string | null> {
    return window.ipcRenderer.invoke('file-read', path)
  },

  async write(path: string, content: string): Promise<void> {
    await window.ipcRenderer.fileSave(path, content)
  },

  async checksum(path: string): Promise<string | null> {
    return window.ipcRenderer.fileChecksum(path)
  },

  async openDialog(): Promise<OpenFileResult | null> {
    return window.ipcRenderer.fileOpen()
  },

  async openFolderDialog(): Promise<string | null> {
    return window.ipcRenderer.folderOpen()
  },

  async createNew(defaultPath?: string): Promise<OpenFileResult | null> {
    return window.ipcRenderer.fileNew(defaultPath)
  },

  async readDir(path: string): Promise<DirEntry[]> {
    return window.ipcRenderer.fileReadDir(path)
  },

  async showInFolder(path: string): Promise<void> {
    await window.ipcRenderer.showItemInFolder(path)
  },
}

// ============================================================================
// Theme Adapter
// ============================================================================

const themeAdapter: ThemeAdapter = {
  async getCurrent(): Promise<ThemeMode> {
    return window.ipcRenderer.getNativeTheme()
  },

  onChange(callback: (theme: ThemeMode) => void): Unsubscribe {
    return window.ipcRenderer.onNativeThemeChanged(callback)
  },
}

// ============================================================================
// Settings Adapter
// ============================================================================

const settingsAdapter: SettingsAdapter = {
  async load(): Promise<AppSettings> {
    return window.ipcRenderer.getAppSettings()
  },

  async saveEditor(settings: EditorSettings): Promise<void> {
    await window.ipcRenderer.setEditorSettings(settings)
  },

  async saveFormatter(settings: FormatterSettings): Promise<void> {
    await window.ipcRenderer.setFormatterSettings(settings)
  },

  async saveSpellcheck(settings: SpellcheckSettings): Promise<void> {
    await window.ipcRenderer.setSpellcheckSettings(settings)
  },

  onChange(callback: (settings: AppSettings) => void): Unsubscribe {
    return window.ipcRenderer.onSettingsChanged(callback)
  },

  async setLastFolder(path: string): Promise<void> {
    await window.ipcRenderer.setLastFolder(path)
  },

  async getInitialFolder(): Promise<string | null> {
    return window.ipcRenderer.getInitialFolder()
  },
}

// ============================================================================
// LSP Adapter
// ============================================================================

const lspAdapter: LspAdapter = {
  createTransport(): LspTransport {
    return {
      reader: new IpcMessageReader(window.ipcRenderer),
      writer: new IpcMessageWriter(window.ipcRenderer),
    }
  },

  onStatus(callback: (status: LspStatus) => void): Unsubscribe {
    return window.ipcRenderer.onLspStatus(callback)
  },
}

// ============================================================================
// Persistence Adapter
// ============================================================================

const persistenceAdapter: PersistenceAdapter = {
  async loadLayout(): Promise<PaneLayout> {
    return window.ipcRenderer.getOpenTabs()
  },

  async saveLayout(layout: PaneLayout): Promise<void> {
    await window.ipcRenderer.setOpenTabs(layout.panes, layout.rows, layout.activePaneId)
  },
}

// ============================================================================
// Commands Adapter
// ============================================================================

type MenuCommand =
  | 'new-file'
  | 'open-file'
  | 'open-folder'
  | 'save'
  | 'format'
  | 'export'
  | 'find'
  | 'replace'
  | 'split-vertical'
  | 'split-horizontal'
  | 'preview'
  | 'insert-asset'
  | 'insert-verbatim'
  | 'open-file-path'

const commandsAdapter: CommandsAdapter = {
  onCommand(command: string, callback: (...args: unknown[]) => void): Unsubscribe {
    const menuCommand = command as MenuCommand
    switch (menuCommand) {
      case 'new-file':
        return window.ipcRenderer.onMenuNewFile(callback)
      case 'open-file':
        return window.ipcRenderer.onMenuOpenFile(callback)
      case 'open-folder':
        return window.ipcRenderer.onMenuOpenFolder(callback)
      case 'save':
        return window.ipcRenderer.onMenuSave(callback)
      case 'format':
        return window.ipcRenderer.onMenuFormat(callback)
      case 'export':
        return window.ipcRenderer.onMenuExport(callback as (format: string) => void)
      case 'find':
        return window.ipcRenderer.onMenuFind(callback)
      case 'replace':
        return window.ipcRenderer.onMenuReplace(callback)
      case 'split-vertical':
        return window.ipcRenderer.onMenuSplitVertical(callback)
      case 'split-horizontal':
        return window.ipcRenderer.onMenuSplitHorizontal(callback)
      case 'preview':
        return window.ipcRenderer.onMenuPreview(callback)
      case 'insert-asset':
        return window.ipcRenderer.on('menu-insert-asset', callback)
      case 'insert-verbatim':
        return window.ipcRenderer.on('menu-insert-verbatim', callback)
      case 'open-file-path':
        return window.ipcRenderer.onOpenFilePath(callback as (path: string) => void)
      default:
        // For unknown commands, use generic on handler
        return window.ipcRenderer.on(`menu-${command}`, callback)
    }
  },

  updateMenuState(state: { hasOpenFile: boolean; isLexFile: boolean }): void {
    window.ipcRenderer.updateMenuState(state)
  },
}

// ============================================================================
// Toast Adapter
// ============================================================================

const toastAdapter: ToastAdapter = {
  show(type: 'success' | 'error' | 'info', message: string): void {
    // Toast is typically shown from the renderer side using sonner
    // This method is for programmatic toast from the adapter
    // The actual implementation would dispatch to the toast library
    console.log(`[Toast ${type}]`, message)
  },

  onShow(callback: (type: 'success' | 'error' | 'info', message: string) => void): Unsubscribe {
    return window.ipcRenderer.onShowToast(callback)
  },
}

// ============================================================================
// Electron Platform Adapter
// ============================================================================

/**
 * Platform adapter for Electron desktop environment.
 *
 * Provides full implementation of all platform operations via Electron IPC.
 * This is the default adapter used by Lexed desktop app.
 */
export const electronAdapter: PlatformAdapter = {
  platform: 'electron',
  fileSystem: fileSystemAdapter,
  theme: themeAdapter,
  settings: settingsAdapter,
  lsp: lspAdapter,
  persistence: persistenceAdapter,
  commands: commandsAdapter,
  toast: toastAdapter,
}
