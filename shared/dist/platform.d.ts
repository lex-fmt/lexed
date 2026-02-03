/**
 * Platform Adapter Interface
 *
 * ## Motivation
 *
 * Lexed's editor components need to run on multiple platforms:
 * - **Electron desktop app** (Lexed): Full filesystem access, native menus, IPC-based LSP
 * - **Web browser app**: localStorage/IndexedDB, keyboard shortcuts, WASM-based LSP
 *
 * Rather than duplicating the editor UI for each platform, we abstract all
 * platform-specific operations behind this interface. The editor components
 * remain pure React/Monaco code that works identically on both platforms.
 *
 * ## Design
 *
 * The interface is organized into logical subsystems:
 *
 * - **fileSystem**: File I/O operations (read, write, open dialogs)
 * - **theme**: System theme detection and changes
 * - **settings**: User preferences persistence
 * - **lsp**: Language server transport factory
 * - **persistence**: Tab/pane layout persistence
 * - **commands**: Menu command subscriptions (optional for web)
 *
 * Each subsystem returns an object with methods, allowing partial implementation
 * where some features aren't available (e.g., web has no native file dialogs).
 *
 * ## Trade-offs
 *
 * - **Abstraction overhead**: Adds one layer of indirection. Acceptable because
 *   platform operations are already async and the abstraction is thin.
 *
 * - **Feature parity**: Web platform has limited capabilities (no native dialogs,
 *   no filesystem write without user gesture). The interface allows graceful
 *   degradation via optional methods and null returns.
 *
 * - **Type safety**: Full TypeScript types ensure implementations match the
 *   interface. Runtime errors are caught at integration testing.
 *
 * ## Usage
 *
 * Components access the adapter via React context:
 *
 * ```typescript
 * const platform = usePlatform();
 * const content = await platform.fileSystem.read(path);
 * ```
 *
 * Platform implementations are injected at app root:
 *
 * ```tsx
 * <PlatformProvider adapter={electronAdapter}>
 *   <App />
 * </PlatformProvider>
 * ```
 *
 * @see ElectronAdapter - Electron implementation
 * @see WebAdapter - Browser implementation (in lex-web)
 */
import type { MessageReader, MessageWriter } from 'vscode-jsonrpc';
/** Theme mode: light or dark */
export type ThemeMode = 'dark' | 'light';
/** Result of opening a file via dialog */
export interface OpenFileResult {
    filePath: string;
    content: string;
}
/** Directory entry from readDir */
export interface DirEntry {
    name: string;
    path: string;
    isDirectory: boolean;
}
/** Pane layout for persistence */
export interface PaneLayout {
    panes: Array<{
        id: string;
        tabs: string[];
        activeTab: string | null;
    }>;
    activePaneId: string | null;
    rows: Array<{
        id: string;
        paneIds: string[];
        size?: number;
        paneSizes?: Record<string, number>;
    }>;
}
/** Editor settings */
export interface EditorSettings {
    showRuler: boolean;
    rulerWidth: number;
    vimMode: boolean;
}
/** Formatter settings */
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
/** Spellcheck settings */
export interface SpellcheckSettings {
    enabled: boolean;
    language: string;
}
/** Keybinding override for a command */
export interface KeybindingOverride {
    mac?: string | null;
    windows?: string | null;
    linux?: string | null;
}
/** Keybinding settings */
export interface KeybindingSettings {
    overrides: Record<string, KeybindingOverride>;
}
/** File tree display settings */
export interface FileTreeSettings {
    showHiddenFiles: boolean;
}
/** All application settings */
export interface AppSettings {
    editor: EditorSettings;
    formatter: FormatterSettings;
    spellcheck: SpellcheckSettings;
    keybindings: KeybindingSettings;
    fileTree: FileTreeSettings;
    lastFolder?: string;
}
/** Unsubscribe function returned by event listeners */
export type Unsubscribe = () => void;
/**
 * File system operations adapter.
 *
 * Abstracts file I/O to support:
 * - Electron: Native filesystem via IPC
 * - Web: File System Access API, localStorage, or IndexedDB
 */
export interface FileSystemAdapter {
    /**
     * Read file contents.
     * @returns File content as string, or null if file doesn't exist
     */
    read(path: string): Promise<string | null>;
    /**
     * Write content to a file.
     * On web, may require user gesture for File System Access API.
     */
    write(path: string, content: string): Promise<void>;
    /**
     * Compute a checksum of file contents.
     * Used by auto-save to detect external modifications.
     * @returns Checksum string, or null if file doesn't exist
     */
    checksum(path: string): Promise<string | null>;
    /**
     * Show file open dialog and read selected file.
     * @returns File path and content, or null if cancelled
     */
    openDialog(): Promise<OpenFileResult | null>;
    /**
     * Show folder open dialog.
     * @returns Selected folder path, or null if cancelled
     */
    openFolderDialog(): Promise<string | null>;
    /**
     * Create a new file.
     * @param defaultPath Optional default directory for the new file
     * @returns New file path and empty content, or null if cancelled
     */
    createNew(defaultPath?: string): Promise<OpenFileResult | null>;
    /**
     * List directory contents.
     * @returns Array of directory entries
     */
    readDir(path: string): Promise<DirEntry[]>;
    /**
     * Reveal file in system file manager.
     * No-op on web platform.
     */
    showInFolder(path: string): Promise<void>;
}
/**
 * Theme adapter for system theme detection.
 */
export interface ThemeAdapter {
    /**
     * Get current system theme.
     */
    getCurrent(): Promise<ThemeMode>;
    /**
     * Subscribe to theme changes.
     * @returns Unsubscribe function
     */
    onChange(callback: (theme: ThemeMode) => void): Unsubscribe;
}
/**
 * Settings persistence adapter.
 */
export interface SettingsAdapter {
    /**
     * Load all application settings.
     */
    load(): Promise<AppSettings>;
    /**
     * Save editor settings.
     */
    saveEditor(settings: EditorSettings): Promise<void>;
    /**
     * Save formatter settings.
     */
    saveFormatter(settings: FormatterSettings): Promise<void>;
    /**
     * Save spellcheck settings.
     */
    saveSpellcheck(settings: SpellcheckSettings): Promise<void>;
    /**
     * Subscribe to settings changes (from other windows or external).
     * @returns Unsubscribe function
     */
    onChange(callback: (settings: AppSettings) => void): Unsubscribe;
    /**
     * Set the last opened folder path.
     */
    setLastFolder(path: string): Promise<void>;
    /**
     * Get the initial folder to open on startup.
     */
    getInitialFolder(): Promise<string | null>;
}
/**
 * LSP transport factory.
 *
 * Creates the message reader/writer pair for LSP communication:
 * - Electron: IPC-based transport to spawned lex-lsp binary
 * - Web: Direct calls to lex-wasm module
 */
export interface LspTransport {
    reader: MessageReader;
    writer: MessageWriter;
}
/** LSP server status */
export interface LspStatus {
    status: string;
    message?: string;
    path?: string;
    code?: number | null;
}
export interface LspAdapter {
    /**
     * Create an LSP transport for communication with the language server.
     */
    createTransport(): LspTransport;
    /**
     * Subscribe to LSP status updates (connecting, ready, error).
     * @returns Unsubscribe function
     */
    onStatus?(callback: (status: LspStatus) => void): Unsubscribe;
}
/**
 * Tab/pane layout persistence adapter.
 */
export interface PersistenceAdapter {
    /**
     * Load saved pane layout.
     */
    loadLayout(): Promise<PaneLayout>;
    /**
     * Save current pane layout.
     */
    saveLayout(layout: PaneLayout): Promise<void>;
}
/**
 * Menu command adapter for native menu integration.
 *
 * Optional - web platform uses keyboard shortcuts only.
 * Commands are identified by string names (e.g., 'save', 'format', 'find').
 */
export interface CommandsAdapter {
    /**
     * Subscribe to a menu command.
     * @param command Command name (e.g., 'save', 'format', 'find', 'export')
     * @param callback Handler function. For 'export', receives format string.
     * @returns Unsubscribe function
     */
    onCommand(command: string, callback: (...args: unknown[]) => void): Unsubscribe;
    /**
     * Update menu state (enable/disable items based on context).
     */
    updateMenuState?(state: {
        hasOpenFile: boolean;
        isLexFile: boolean;
    }): void;
}
/**
 * Toast notification adapter.
 */
export interface ToastAdapter {
    /**
     * Show a toast notification.
     */
    show(type: 'success' | 'error' | 'info', message: string): void;
    /**
     * Subscribe to toast requests (from main process or LSP).
     * @returns Unsubscribe function
     */
    onShow?(callback: (type: 'success' | 'error' | 'info', message: string) => void): Unsubscribe;
}
/**
 * Platform adapter interface.
 *
 * Provides platform-specific implementations for all editor operations.
 * See module documentation for design rationale and usage examples.
 */
export interface PlatformAdapter {
    /** Platform identifier */
    readonly platform: 'electron' | 'web';
    /** File system operations */
    fileSystem: FileSystemAdapter;
    /** System theme detection */
    theme: ThemeAdapter;
    /** Settings persistence */
    settings: SettingsAdapter;
    /** LSP transport factory */
    lsp: LspAdapter;
    /** Tab/pane layout persistence */
    persistence: PersistenceAdapter;
    /** Menu commands (optional on web) */
    commands?: CommandsAdapter;
    /** Toast notifications */
    toast: ToastAdapter;
}
