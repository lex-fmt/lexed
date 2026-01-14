import { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'
const DEFAULT_LOG_FILE = 'lexed.log'

import {
  WindowManager,
  AppSettings,
  PaneLayoutSettings,
  PaneRowLayout,
  EditorSettings,
  FormatterSettings,
  FileTreeSettings,
} from './window-manager'
import { randomUUID } from 'crypto'
// LspManager import removed as it is managed by WindowManager

// Configure logging
log.initialize()

const resolveLogLevel = (fallback: log.LogLevel, devFallback: log.LogLevel) => {
  const requested = process.env.LEX_LOG_LEVEL?.toLowerCase() as log.LogLevel | undefined
  if (requested) return requested
  if (process.env.NODE_ENV === 'development') {
    return devFallback
  }
  return fallback
}

const fileLogLevel = resolveLogLevel('info', 'debug')
const consoleLogLevel =
  (process.env.LEX_LOG_CONSOLE_LEVEL?.toLowerCase() as log.LogLevel) ??
  (process.env.NODE_ENV === 'development' ? fileLogLevel : 'error')

log.transports.file.resolvePathFn = () => path.join(app.getPath('logs'), DEFAULT_LOG_FILE)
log.transports.file.level = fileLogLevel
log.transports.console.level = consoleLogLevel
log.transports.console.useStyles = true
log.info('Logging initialised', {
  file: log.transports.file.getFile()?.path,
  fileLevel: fileLogLevel,
  consoleLevel: consoleLogLevel,
  nodeEnv: process.env.NODE_ENV,
})

// Optional: Catch all unhandled errors
log.errorHandler.startCatching()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type ThemeMode = 'dark' | 'light'

const DARK_BACKGROUND_COLOR = '#1e1e1e'
const LIGHT_BACKGROUND_COLOR = '#ffffff'

function getSystemTheme(): ThemeMode {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

function getWindowBackground(theme: ThemeMode): string {
  return theme === 'dark' ? DARK_BACKGROUND_COLOR : LIGHT_BACKGROUND_COLOR
}

import Store from 'electron-store'

// ... imports

// Settings persistence
const SETTINGS_FILE = 'settings' // electron-store adds .json extension

// Local interface definitions removed in favor of window-manager exports
// to ensure type consistency across the main process.

interface MenuState {
  hasOpenFile: boolean
  isLexFile: boolean
}

const resolveFixtureRoot = () => {
  const override = process.env.LEX_TEST_FIXTURES
  if (override) {
    return path.resolve(override)
  }
  return path.join(process.env.APP_ROOT ?? path.join(__dirname, '..'), 'tests', 'fixtures')
}

const TEST_FIXTURES_DIR = resolveFixtureRoot()

async function loadTestFixture(fixtureName: string): Promise<{ path: string; content: string }> {
  const normalized = path.normalize(fixtureName).replace(/^([.]{2,}(?:\\|\/|$))+/, '')
  const fixturePath = path.join(TEST_FIXTURES_DIR, normalized)
  const fixturesRoot = path.resolve(TEST_FIXTURES_DIR)
  const resolved = path.resolve(fixturePath)
  if (!resolved.startsWith(fixturesRoot)) {
    throw new Error('Invalid fixture path')
  }
  const content = await fs.readFile(resolved, 'utf-8')
  return { path: resolved, content }
}

const store = new Store<AppSettings>({
  name: SETTINGS_FILE,
  schema: {
    lastFolder: { type: 'string' },
    openTabs: { type: 'array' },
    activeTab: { type: 'string' },
    paneLayout: { type: 'array' },
    paneRows: { type: 'array' },
    activePaneId: { type: 'string' },
    windowState: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        isMaximized: { type: 'boolean' },
      },
    },
    openWindows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          isMaximized: { type: 'boolean' },
          lastFolder: { type: 'string' },
          paneLayout: { type: 'array' },
          paneRows: { type: 'array' },
          activePaneId: { type: 'string' },
        },
      },
    },
    editor: {
      type: 'object',
      properties: {
        showRuler: { type: 'boolean', default: false },
        rulerWidth: { type: 'number', default: 100 },
        vimMode: { type: 'boolean', default: false },
      },
      default: {},
    },
    formatter: {
      type: 'object',
      properties: {
        sessionBlankLinesBefore: { type: 'number', default: 1 },
        sessionBlankLinesAfter: { type: 'number', default: 1 },
        normalizeSeqMarkers: { type: 'boolean', default: true },
        unorderedSeqMarker: { type: 'string', default: '-' },
        maxBlankLines: { type: 'number', default: 2 },
        indentString: { type: 'string', default: '    ' },
        preserveTrailingBlanks: { type: 'boolean', default: false },
        normalizeVerbatimMarkers: { type: 'boolean', default: true },
        formatOnSave: { type: 'boolean', default: false },
      },
      default: {},
    },
    spellcheck: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        language: { type: 'string', default: 'en_US' },
      },
      default: {},
    },
    fileTree: {
      type: 'object',
      properties: {
        showHiddenFiles: { type: 'boolean', default: false },
      },
      default: {},
    },
    keybindings: {
      type: 'object',
      properties: {
        overrides: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              mac: { type: ['string', 'null'] },
              windows: { type: ['string', 'null'] },
              linux: { type: ['string', 'null'] },
            },
          },
        },
      },
      default: {},
    },
  },
})

// Initialize WindowManager after store is created
const windowManager = new WindowManager(store)

// Settings persistence helpers removed in favor of direct store access or WindowManager
// loadSettings, saveSettings, etc. are no longer used directly in main.ts logic
// except for legacy migration which can use store.store directly.

function getWelcomeFolderPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'welcome')
  }
  return path.join(process.env.APP_ROOT!, 'welcome')
}

/**
 * Get the default user project directory path.
 * - macOS: ~/Documents/LexEd
 * - Windows: %USERPROFILE%\Documents\LexEd
 * - Linux: ~/Documents/LexEd (or ~/LexEd if Documents doesn't exist)
 */
function getDefaultProjectPath(): string {
  const documentsPath = app.getPath('documents')
  return path.join(documentsPath, 'LexEd')
}

/**
 * Sets up the default project directory and copies welcome document on first launch.
 * Returns the path to the welcome file if this is first launch, null otherwise.
 * Skipped during tests (LEX_DISABLE_PERSISTENCE=1).
 */
async function setupFirstLaunch(): Promise<string | null> {
  // Skip first-launch setup during tests
  if (process.env.LEX_DISABLE_PERSISTENCE === '1') {
    return null
  }

  const projectPath = getDefaultProjectPath()
  const welcomeFilePath = path.join(projectPath, 'welcome-to-lex.lex')

  // Check if this is first launch by checking if our project folder exists
  try {
    await fs.access(projectPath)
    // Folder exists, not first launch
    return null
  } catch {
    // Folder doesn't exist, this is first launch
  }

  log.info('[FirstLaunch] Setting up default project directory:', projectPath)

  try {
    // Create the LexEd directory
    await fs.mkdir(projectPath, { recursive: true })

    // Copy welcome document from bundled resources
    const bundledWelcomePath = path.join(getWelcomeFolderPath(), 'welcome-to-lex.lex')
    const welcomeContent = await fs.readFile(bundledWelcomePath, 'utf-8')
    await fs.writeFile(welcomeFilePath, welcomeContent, 'utf-8')

    log.info('[FirstLaunch] Created project directory and copied welcome document')
    return welcomeFilePath
  } catch (error) {
    log.error('[FirstLaunch] Failed to setup project directory:', error)
    return null
  }
}

// ... (rest of the file)

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let applicationMenu: Electron.Menu | null = null
let currentMenuState: MenuState = {
  hasOpenFile: false,
  isLexFile: false,
}

interface CliPaths {
  files: string[]
  folder: string | null
}

/**
 * Extract paths from command line arguments for CLI usage.
 * Returns files to open and an optional folder to set as workspace.
 */
function extractPathsFromArgv(argv: string[]): CliPaths {
  const paths = argv
    .filter((arg) => !arg.startsWith('-') && !arg.startsWith('--'))
    .filter((arg) => {
      // Skip the electron binary and main script paths
      if (arg.includes('electron') || arg.includes('Electron')) return false
      if (arg.endsWith('.js') || arg.endsWith('.mjs')) return false
      return true
    })
    .map((arg) => path.resolve(arg))

  const files: string[] = []
  let folder: string | null = null

  for (const p of paths) {
    try {
      const stat = fsSync.statSync(p)
      if (stat.isDirectory()) {
        // Use the first directory as the workspace folder
        if (!folder) {
          folder = p
        }
      } else if (stat.isFile()) {
        files.push(p)
        // If opening a file, use its directory as folder if no folder specified
        if (!folder) {
          folder = path.dirname(p)
        }
      }
    } catch {
      // Path doesn't exist - could be a new file
      if (p.endsWith('.lex')) {
        files.push(p)
      }
    }
  }

  return { files, folder }
}

/**
 * Open files in the renderer by sending IPC messages.
 * If no windows exist, creates a new one.
 */
function openFilesInWindow(filePaths: string[]) {
  if (filePaths.length === 0) return

  const windows = windowManager.getAllWindows()
  const targetWin = windows[0]

  if (targetWin && !targetWin.isDestroyed()) {
    for (const filePath of filePaths) {
      targetWin.webContents.send('open-file-path', filePath)
      app.addRecentDocument(filePath)
    }
  } else {
    // No windows exist, create a new one with the files
    windowManager.createWindow(undefined, { showSplash: true, openFiles: filePaths })
  }
}

/**
 * Open paths from CLI arguments.
 * Handles both files and folders.
 */
function openCliPaths(cliPaths: CliPaths) {
  const { files, folder } = cliPaths
  if (files.length === 0 && !folder) return

  const windows = windowManager.getAllWindows()
  const targetWin = windows[0]

  if (targetWin && !targetWin.isDestroyed()) {
    // Set folder first if specified
    if (folder) {
      targetWin.webContents.send('open-folder-path', folder)
    }
    // Then open files
    for (const filePath of files) {
      targetWin.webContents.send('open-file-path', filePath)
      app.addRecentDocument(filePath)
    }
    // Bring window to front
    if (targetWin.isMinimized()) targetWin.restore()
    targetWin.focus()
  } else {
    // No windows exist, create a new one
    // The folder will be set via settings if provided
    if (folder) {
      store.set('lastFolder', folder)
    }
    windowManager.createWindow(undefined, { showSplash: true, openFiles: files })
  }
}

function applyMenuState(state: MenuState) {
  currentMenuState = state
  if (!applicationMenu) {
    return
  }

  const setEnabled = (id: string, enabled: boolean) => {
    const item = applicationMenu?.getMenuItemById(id)
    if (item) {
      item.enabled = enabled
    }
  }

  const hasOpenFile = !!state.hasOpenFile
  const isLexFileOpen = !!state.isLexFile

  setEnabled('menu-save', hasOpenFile)
  setEnabled('menu-format', hasOpenFile && isLexFileOpen)
  setEnabled('menu-export-markdown', hasOpenFile && isLexFileOpen)
  setEnabled('menu-export-html', hasOpenFile && isLexFileOpen)
  setEnabled('menu-export-pdf', hasOpenFile && isLexFileOpen)
  setEnabled('menu-find', hasOpenFile)
  setEnabled('menu-replace', hasOpenFile)
  setEnabled('menu-preview', hasOpenFile && isLexFileOpen)
  setEnabled('menu-insert-asset', hasOpenFile && isLexFileOpen)
  setEnabled('menu-insert-verbatim', hasOpenFile && isLexFileOpen)
  setEnabled('menu-reorder-footnotes', hasOpenFile && isLexFileOpen)
  setEnabled('menu-next-annotation', hasOpenFile && isLexFileOpen)
  setEnabled('menu-prev-annotation', hasOpenFile && isLexFileOpen)
  setEnabled('menu-resolve-annotation', hasOpenFile && isLexFileOpen)
  setEnabled('menu-toggle-annotations', hasOpenFile && isLexFileOpen)
}

ipcMain.handle('file-new', async (event, defaultPath?: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: defaultPath || undefined,
    filters: [{ name: 'Lex Files', extensions: ['lex'] }],
  })
  if (canceled || !filePath) {
    return null
  }
  // Create empty file
  await fs.writeFile(filePath, '', 'utf-8')
  return { filePath, content: '' }
})

ipcMain.handle('file-open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Lex Files', extensions: ['lex'] }],
  })
  if (canceled || filePaths.length === 0) {
    return null
  }
  const filePath = filePaths[0]
  const content = await fs.readFile(filePath, 'utf-8')
  // Add to recent documents (macOS Dock menu, Windows Jump List)
  app.addRecentDocument(filePath)
  return { filePath, content }
})

ipcMain.handle(
  'file-pick',
  async (event, options: { title?: string; filters?: Electron.FileFilter[] } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: options.title,
      properties: ['openFile'],
      filters: options.filters,
    })
    if (canceled || filePaths.length === 0) {
      return null
    }
    return filePaths[0]
  }
)

ipcMain.handle('test-load-fixture', async (_event, fixtureName: string) => {
  try {
    return await loadTestFixture(fixtureName)
  } catch (error) {
    console.error('Failed to load test fixture:', error)
    throw error
  }
})

ipcMain.handle('get-benchmark-file', async () => {
  try {
    const fixture = await loadTestFixture('benchmark.lex')
    return fixture.path
  } catch (error) {
    console.error('Failed to resolve benchmark fixture:', error)
    return null
  }
})

ipcMain.handle('file-save', async (_, filePath: string, content: string) => {
  await fs.writeFile(filePath, content, 'utf-8')
  return true
})

ipcMain.handle('test-set-workspace', async (_, folderPath: string) => {
  store.set('lastFolder', folderPath)
  return true
})

ipcMain.handle('file-read-dir', async (_, dirPath: string) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      path: path.join(dirPath, entry.name),
    }))
  } catch (error) {
    console.error('Failed to read directory:', error)
    return []
  }
})

ipcMain.handle('dialog-show-open-dialog', async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, options)
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
})

ipcMain.handle('path-relative', (_event, from, to) => {
  return path.relative(from, to)
})

ipcMain.handle('file-read', async (_, filePath: string) => {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (error) {
    console.error('Failed to read file:', error)
    return null
  }
})

/**
 * Computes a checksum of a file's content for auto-save conflict detection.
 *
 * Used by the auto-save system to detect if a file was modified externally
 * (by another editor or process) since the last save.
 *
 * Algorithm: Simple djb2-style hash - fast and collision-resistant enough
 * for this use case. Same algorithm is used in EditorPane.tsx for consistency.
 *
 * @returns Hex string checksum, or null if file doesn't exist/can't be read
 */
ipcMain.handle('file-checksum', async (_, filePath: string) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0
    }
    return hash.toString(16)
  } catch (error) {
    console.error('Failed to compute checksum:', error)
    return null
  }
})

ipcMain.handle('folder-open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  })
  if (canceled || filePaths.length === 0) {
    return null
  }
  return filePaths[0]
})

ipcMain.handle('get-initial-folder', async (event) => {
  // During tests, always use the welcome folder to avoid contamination from user settings
  if (process.env.LEX_DISABLE_PERSISTENCE === '1') {
    return getWelcomeFolderPath()
  }

  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return getWelcomeFolderPath()

  const settings = store.store
  // Find window state
  const winState = settings.openWindows?.find(
    (w) => w.id === windowManager.getWindowStateId(win.id)
  )

  if (winState?.lastFolder) {
    try {
      await fs.access(winState.lastFolder)
      return winState.lastFolder
    } catch {
      // Folder no longer exists
    }
  }

  // Fallback to global lastFolder (legacy/migration) or welcome
  if (settings.lastFolder) {
    try {
      await fs.access(settings.lastFolder)
      return settings.lastFolder
    } catch {
      // Folder no longer exists
    }
  }

  return getWelcomeFolderPath()
})

ipcMain.handle('set-last-folder', async (event, folderPath: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false

  const stateId = windowManager.getWindowStateId(win.id)
  if (!stateId) return false

  const settings = store.store
  const openWindows = settings.openWindows || []
  const index = openWindows.findIndex((w) => w.id === stateId)

  if (index >= 0) {
    openWindows[index].lastFolder = folderPath
    store.set('openWindows', openWindows)
    windowManager.updateTitle(win.id, folderPath)
  }

  // Also update global for legacy/fallback? Maybe not needed.
  return true
})

ipcMain.handle('get-open-tabs', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null

  const stateId = windowManager.getWindowStateId(win.id)
  const settings = store.store
  const winState = settings.openWindows?.find((w) => w.id === stateId)

  // If no window state found (new window?), return empty/default
  if (!winState) {
    return {
      panes: [{ id: randomUUID(), tabs: [], activeTab: null }],
      activePaneId: null,
      rows: [],
    }
  }

  const savedPanes =
    winState.paneLayout && winState.paneLayout.length > 0
      ? winState.paneLayout
      : [
          {
            id: winState.activePaneId || randomUUID(),
            tabs: [], // Don't restore tabs from global settings to avoid confusion? Or should we?
            activeTab: null,
          },
        ]

  const panes: PaneLayoutSettings[] = []
  for (const pane of savedPanes) {
    const paneId = pane.id || randomUUID()
    const filteredTabs: string[] = []
    for (const tab of pane.tabs || []) {
      try {
        await fs.access(tab)
        filteredTabs.push(tab)
      } catch {
        // Ignore missing files
      }
    }

    panes.push({
      id: paneId,
      tabs: filteredTabs,
      activeTab:
        pane.activeTab && filteredTabs.includes(pane.activeTab)
          ? pane.activeTab
          : filteredTabs[0] || null,
    })
  }

  if (panes.length === 0) {
    panes.push({ id: randomUUID(), tabs: [], activeTab: null })
  }

  const paneIdSet = new Set(panes.map((p) => p.id))
  let rows =
    winState.paneRows && winState.paneRows.length > 0
      ? winState.paneRows
          .map((row) => {
            const paneIds = (row.paneIds || []).filter((id) => paneIdSet.has(id))
            const paneSizes: Record<string, number> = {}
            paneIds.forEach((id) => {
              const value = row.paneSizes?.[id]
              if (typeof value === 'number') {
                paneSizes[id] = value
              }
            })
            return {
              id: row.id || randomUUID(),
              paneIds,
              size: typeof row.size === 'number' ? row.size : undefined,
              paneSizes,
            }
          })
          .filter((row) => row.paneIds.length > 0)
      : []

  if (rows.length === 0) {
    rows = [
      {
        id: randomUUID(),
        paneIds: panes.map((p) => p.id),
        size: undefined,
        paneSizes: {},
      },
    ]
  } else {
    const referenced = new Set(rows.flatMap((row) => row.paneIds))
    const missing = panes.map((p) => p.id).filter((id) => !referenced.has(id))
    if (missing.length > 0) {
      rows[0] = { ...rows[0], paneIds: [...rows[0].paneIds, ...missing] }
    }
  }

  const activePaneId =
    winState.activePaneId && panes.some((p) => p.id === winState.activePaneId)
      ? winState.activePaneId
      : panes[0]?.id || null

  return {
    panes,
    activePaneId,
    rows,
  }
})

ipcMain.handle(
  'set-open-tabs',
  async (
    event,
    panes: PaneLayoutSettings[],
    rows: PaneRowLayout[],
    activePaneId: string | null
  ) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false

    const stateId = windowManager.getWindowStateId(win.id)
    if (!stateId) return false

    const settings = store.store
    const openWindows = settings.openWindows || []
    const index = openWindows.findIndex((w) => w.id === stateId)

    if (index >= 0) {
      openWindows[index].paneLayout = panes.map((pane) => ({
        id: pane.id || randomUUID(),
        tabs: pane.tabs || [],
        activeTab: pane.activeTab ?? null,
      }))
      openWindows[index].paneRows = rows.map((row) => ({
        id: row.id || randomUUID(),
        paneIds: row.paneIds || [],
        size: row.size,
        paneSizes: row.paneSizes,
      }))
      openWindows[index].activePaneId = activePaneId || undefined

      store.set('openWindows', openWindows)
    }
    return true
  }
)

/**
 * Shares document content via WhatsApp using the URL scheme.
 * Opens WhatsApp with the document text pre-filled in a new message.
 */
ipcMain.handle('share-whatsapp', async (_, content: string): Promise<void> => {
  const encodedText = encodeURIComponent(content)
  const whatsappUrl = `whatsapp://send?text=${encodedText}`
  await shell.openExternal(whatsappUrl)
})

// Show item in system file manager
ipcMain.handle('show-item-in-folder', async (_, fullPath: string) => {
  // On macOS, use 'open -R' to reveal file in Finder with selection
  // (shell.showItemInFolder doesn't always bring Finder to foreground)
  if (process.platform === 'darwin') {
    const { exec } = await import('child_process')
    const escapedPath = fullPath.replace(/"/g, '\\"')
    exec(`open -R "${escapedPath}"`)
  } else {
    shell.showItemInFolder(fullPath)
  }
})

// Theme detection
ipcMain.handle('get-native-theme', () => {
  return getSystemTheme()
})

ipcMain.handle('get-app-settings', () => {
  return store.store
})

ipcMain.handle('set-editor-settings', (_event, settings: EditorSettings) => {
  store.set('editor', settings)
  // Notify all windows about settings change
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send('settings-changed', store.store)
  })
  return true
})

ipcMain.handle('set-formatter-settings', (_event, settings: FormatterSettings) => {
  store.set('formatter', settings)
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send('settings-changed', store.store)
  })
  return true
})

ipcMain.handle(
  'set-spellcheck-settings',
  (_event, settings: { enabled: boolean; language: string }) => {
    console.log('[Main] Received set-spellcheck-settings:', settings)
    store.set('spellcheck', settings)
    BrowserWindow.getAllWindows().forEach((w) => {
      w.webContents.send('settings-changed', store.store)
    })
    return true
  }
)

ipcMain.handle('set-filetree-settings', (_event, settings: FileTreeSettings) => {
  store.set('fileTree', settings)
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send('settings-changed', store.store)
  })
  return true
})

ipcMain.on('get-native-theme-sync', (event) => {
  event.returnValue = getSystemTheme()
})

ipcMain.on('update-menu-state', (_event, state: MenuState) => {
  applyMenuState({
    hasOpenFile: !!state?.hasOpenFile,
    isLexFile: !!state?.isLexFile,
  })
})

// Listen for OS theme changes and notify renderer
nativeTheme.on('updated', () => {
  const theme = getSystemTheme()
  windowManager.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.setBackgroundColor(getWindowBackground(theme))
      win.webContents.send('native-theme-changed', theme)
    }
  })
})

ipcMain.on('lsp-input', (event, data) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    const lsp = windowManager.getLsp(win.id)
    lsp?.sendInput(data)
  }
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // lspManager.stop(); // Handled by WindowManager per window
  if (process.platform !== 'darwin') {
    windowManager.setQuitting(true)
    app.quit()
  }
})

app.on('before-quit', () => {
  windowManager.setQuitting(true)
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    // Restore windows from session or create new one
    windowManager.restoreWindows()
  }
})

// Migration logic moved to main whenReady block

function createMenu() {
  const isMac = process.platform === 'darwin'

  const getTargetWindow = (focusedWindow: BrowserWindow | undefined) => {
    return focusedWindow || windowManager.getAllWindows()[0]
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Settings...',
                accelerator: 'CmdOrCtrl+,' as const,
                click: (_: Electron.MenuItem, focusedWindow: BrowserWindow | undefined) =>
                  getTargetWindow(focusedWindow)?.webContents.send('menu-show-settings'),
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => windowManager.createWindow(),
        },
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-new-file'),
        },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-open-file'),
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-open-folder'),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          id: 'menu-save',
          enabled: false,
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-save'),
        },
        { type: 'separator' },
        {
          label: 'Export',
          submenu: [
            {
              label: 'Export to Markdown',
              id: 'menu-export-markdown',
              enabled: false,
              click: (_, focusedWindow) =>
                getTargetWindow(focusedWindow)?.webContents.send('menu-export', 'markdown'),
            },
            {
              label: 'Export to HTML',
              id: 'menu-export-html',
              enabled: false,
              click: (_, focusedWindow) =>
                getTargetWindow(focusedWindow)?.webContents.send('menu-export', 'html'),
            },
            {
              label: 'Export to PDF',
              id: 'menu-export-pdf',
              enabled: false,
              click: (_, focusedWindow) =>
                getTargetWindow(focusedWindow)?.webContents.send('menu-export', 'pdf'),
            },
          ],
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          id: 'menu-find',
          enabled: false,
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-find'),
        },
        {
          label: 'Replace',
          accelerator: 'CmdOrCtrl+H',
          id: 'menu-replace',
          enabled: false,
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-replace'),
        },
        { type: 'separator' },
        {
          label: 'Format Document',
          accelerator: 'Shift+Option+F',
          id: 'menu-format',
          enabled: false,
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-format'),
        },
        {
          label: 'Insert Asset',
          accelerator: 'CmdOrCtrl+Shift+I',
          id: 'menu-insert-asset',
          enabled: false,
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-insert-asset'),
        },
        {
          label: 'Insert Verbatim',
          accelerator: 'CmdOrCtrl+Shift+V',
          id: 'menu-insert-verbatim',
          enabled: false,
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-insert-verbatim'),
        },
        { type: 'separator' },
        {
          label: 'Reorder Footnotes',
          id: 'menu-reorder-footnotes',
          enabled: false,
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-reorder-footnotes'),
        },
        { type: 'separator' },
        {
          label: 'Resolve Annotation',
          accelerator: 'CmdOrCtrl+Shift+Enter',
          id: 'menu-resolve-annotation',
          enabled: false,
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-resolve-annotation'),
        },
        {
          label: 'Next Annotation',
          accelerator: 'Ctrl+PgDown',
          id: 'menu-next-annotation',
          enabled: false,
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-next-annotation'),
        },
        {
          label: 'Previous Annotation',
          accelerator: 'Ctrl+PgUp',
          id: 'menu-prev-annotation',
          enabled: false,
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-prev-annotation'),
        },
        // Settings in Edit menu for non-macOS platforms
        ...(!isMac
          ? [
              { type: 'separator' as const },
              {
                label: 'Settings',
                accelerator: 'CmdOrCtrl+,' as const,
                click: (_: Electron.MenuItem, focusedWindow: BrowserWindow | undefined) =>
                  getTargetWindow(focusedWindow)?.webContents.send('menu-show-settings'),
              },
            ]
          : []),
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Preview',
          accelerator: 'CmdOrCtrl+Shift+P',
          id: 'menu-preview',
          enabled: false,
          click: (_, focusedWindow) => focusedWindow?.webContents.send('menu-preview'),
        },
        {
          label: 'Toggle Annotations',
          id: 'menu-toggle-annotations',
          enabled: false,
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-toggle-annotations'),
        },
        {
          label: 'Toggle Hidden Files',
          id: 'menu-toggle-hidden-files',
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-toggle-hidden-files'),
        },
        { type: 'separator' },
        {
          label: 'Show Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+Shift+/',
          click: (_, focusedWindow) =>
            getTargetWindow(focusedWindow)?.webContents.send('menu-show-shortcuts'),
        },
        { type: 'separator' },
        { role: 'reload', accelerator: 'CmdOrCtrl+Alt+R' },
        { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+Alt+R' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // Shell menu (macOS only) - CLI installation
    ...(isMac
      ? [
          {
            label: 'Shell',
            submenu: [
              {
                id: 'menu-install-cli',
                label: "Install 'lexed' command in PATH",
                visible: !isCliInstalled(),
                click: async () => {
                  const result = await installCliCommand()
                  updateShellMenuVisibility()
                  const windows = windowManager.getAllWindows()
                  const targetWindow = windows.find((w) => w.isFocused()) || windows[0]
                  if (targetWindow && !targetWindow.isDestroyed()) {
                    targetWindow.webContents.send(
                      'show-toast',
                      result.success ? 'success' : 'error',
                      result.message
                    )
                  }
                },
              },
              {
                id: 'menu-uninstall-cli',
                label: "Uninstall 'lexed' command from PATH",
                visible: isCliInstalled(),
                click: async () => {
                  const result = await uninstallCliCommand()
                  updateShellMenuVisibility()
                  const windows = windowManager.getAllWindows()
                  const targetWindow = windows.find((w) => w.isFocused()) || windows[0]
                  if (targetWindow && !targetWindow.isDestroyed()) {
                    targetWindow.webContents.send(
                      'show-toast',
                      result.success ? 'success' : 'error',
                      result.message
                    )
                  }
                },
              },
            ],
          },
        ]
      : []),
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }]),
      ],
    },
  ]

  applicationMenu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(applicationMenu)
  applyMenuState(currentMenuState)
}

/**
 * Check if the CLI command is installed.
 */
function isCliInstalled(): boolean {
  if (process.platform !== 'darwin') return false
  const targetPath = '/usr/local/bin/lexed'
  try {
    const linkTarget = fsSync.readlinkSync(targetPath)
    // Check if it points to our app's bin/lexed
    return linkTarget.includes('LexEd.app') || linkTarget.includes('lexed/bin/lexed')
  } catch {
    return false
  }
}

/**
 * Update the Shell menu visibility based on CLI install status.
 */
function updateShellMenuVisibility() {
  if (!applicationMenu) return
  const installItem = applicationMenu.getMenuItemById('menu-install-cli')
  const uninstallItem = applicationMenu.getMenuItemById('menu-uninstall-cli')
  if (installItem && uninstallItem) {
    const installed = isCliInstalled()
    installItem.visible = !installed
    uninstallItem.visible = installed
  }
}

/**
 * Install the 'lexed' CLI command in PATH.
 * Creates a symlink from /usr/local/bin/lexed to the bundled CLI script.
 * Requires administrator privileges on macOS.
 */
async function installCliCommand(): Promise<{ success: boolean; message: string }> {
  if (process.platform !== 'darwin') {
    return { success: false, message: 'CLI installation is only supported on macOS' }
  }

  const targetPath = '/usr/local/bin/lexed'
  const sourcePath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'lexed')
    : path.join(__dirname, '..', 'bin', 'lexed')

  // Check if source exists
  if (!fsSync.existsSync(sourcePath)) {
    return { success: false, message: `CLI script not found at ${sourcePath}` }
  }

  // Check if already installed and pointing to correct location
  try {
    const existingLink = fsSync.readlinkSync(targetPath)
    if (existingLink === sourcePath) {
      return { success: true, message: 'CLI command is already installed' }
    }
  } catch {
    // Target doesn't exist or isn't a symlink - continue with installation
  }

  // Create /usr/local/bin if it doesn't exist and create symlink
  // Use osascript to get admin privileges
  const { exec } = await import('child_process')
  const { promisify } = await import('util')
  const execAsync = promisify(exec)

  const script = `
    do shell script "mkdir -p /usr/local/bin && rm -f ${targetPath} && ln -s '${sourcePath}' ${targetPath}" with administrator privileges
  `

  try {
    await execAsync(`osascript -e '${script}'`)
    return {
      success: true,
      message: `Successfully installed 'lexed' command.\n\nYou can now open files with:\n  lexed /path/to/file.lex`,
    }
  } catch (error) {
    const err = error as Error & { code?: number }
    if (err.code === 1) {
      // User cancelled the admin dialog
      return { success: false, message: 'Installation cancelled' }
    }
    return { success: false, message: `Failed to install CLI: ${err.message}` }
  }
}

/**
 * Uninstall the 'lexed' CLI command from PATH.
 */
async function uninstallCliCommand(): Promise<{ success: boolean; message: string }> {
  if (process.platform !== 'darwin') {
    return { success: false, message: 'CLI uninstallation is only supported on macOS' }
  }

  const targetPath = '/usr/local/bin/lexed'

  // Check if installed
  if (!fsSync.existsSync(targetPath)) {
    return { success: true, message: 'CLI command is not installed' }
  }

  const { exec } = await import('child_process')
  const { promisify } = await import('util')
  const execAsync = promisify(exec)

  const script = `
    do shell script "rm -f ${targetPath}" with administrator privileges
  `

  try {
    await execAsync(`osascript -e '${script}'`)
    return { success: true, message: "Successfully uninstalled 'lexed' command" }
  } catch (error) {
    const err = error as Error & { code?: number }
    if (err.code === 1) {
      return { success: false, message: 'Uninstallation cancelled' }
    }
    return { success: false, message: `Failed to uninstall CLI: ${err.message}` }
  }
}

// Windows: Set App User Model ID for proper taskbar grouping
if (process.platform === 'win32') {
  app.setAppUserModelId('com.lex.lexed')
}

// Single instance lock - ensure only one instance of the app runs
const gotTheLock =
  process.env.LEX_DISABLE_SINGLE_INSTANCE_LOCK === '1' ? true : app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit()
} else {
  // Handle second instance launch (Windows/Linux: file opened when app is already running)
  // Also handles CLI invocations via `lexed /path`
  app.on('second-instance', (_event, argv) => {
    // Extract paths from CLI arguments (handles both files and folders)
    const cliPaths = extractPathsFromArgv(argv)

    if (cliPaths.files.length > 0 || cliPaths.folder) {
      // CLI invocation with paths
      openCliPaths(cliPaths)
    } else {
      // No paths, just focus the existing window
      const windows = windowManager.getAllWindows()
      if (windows.length > 0) {
        const win = windows[0]
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    }
  })

  // macOS: Handle file open via Finder (double-click, drag-drop, Open With)
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (filePath.endsWith('.lex')) {
      openFilesInWindow([filePath])
    }
  })

  app.whenReady().then(async () => {
    app.setAboutPanelOptions({
      applicationName: 'LexEd',
      applicationVersion: app.getVersion(),
      copyright: 'Copyright © 2024 Lex',
      credits: 'Developed by the Lex Team',
    })
    createMenu()

    // Configure auto-updater
    autoUpdater.logger = log
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    // Auto-updater event handlers
    autoUpdater.on('checking-for-update', () => {
      log.info('[AutoUpdater] Checking for updates...')
    })

    autoUpdater.on('update-available', (info) => {
      log.info('[AutoUpdater] Update available:', info.version)
    })

    autoUpdater.on('update-not-available', () => {
      log.info('[AutoUpdater] No updates available')
    })

    autoUpdater.on('download-progress', (progress) => {
      log.info(`[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}%`)
    })

    autoUpdater.on('update-downloaded', (info) => {
      log.info('[AutoUpdater] Update downloaded:', info.version)
      // Notify all windows that an update is ready
      windowManager.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('update-downloaded', info.version)
        }
      })
    })

    autoUpdater.on('error', (error) => {
      log.error('[AutoUpdater] Error:', error.message)
    })

    // Check for updates (only in production)
    if (app.isPackaged) {
      // Delay initial check to avoid slowing down startup
      setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify().catch((error) => {
          log.error('[AutoUpdater] Failed to check for updates:', error.message)
        })
      }, 3000)
    }

    // Migration logic (run once on startup)
    const settings = store.store
    if (!settings.openWindows && (settings.paneLayout || settings.paneRows)) {
      // Migrate legacy single-window state
      console.log('Migrating legacy window state...')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacyState: any = {
        id: randomUUID(),
        width: settings.windowState?.width || 1200,
        height: settings.windowState?.height || 800,
        x: settings.windowState?.x,
        y: settings.windowState?.y,
        isMaximized: settings.windowState?.isMaximized,
        paneLayout: settings.paneLayout,
        paneRows: settings.paneRows,
        activePaneId: settings.activePaneId,
        lastFolder: settings.lastFolder,
      }

      store.set('openWindows', [legacyState])
    }

    // Handle first launch setup (create Documents/LexEd and copy welcome doc)
    const welcomeFilePath = await setupFirstLaunch()

    // Handle paths passed via command line on initial launch (CLI support)
    const cliPaths = extractPathsFromArgv(process.argv)
    if (cliPaths.files.length > 0 || cliPaths.folder) {
      // CLI invocation with paths
      if (cliPaths.folder) {
        store.set('lastFolder', cliPaths.folder)
      }
      windowManager.createWindow(undefined, { showSplash: true, openFiles: cliPaths.files })
    } else if (welcomeFilePath) {
      // First launch: set the LexEd folder as workspace and open welcome file
      const projectPath = getDefaultProjectPath()
      store.set('lastFolder', projectPath)
      windowManager.createWindow(undefined, { showSplash: true, openFiles: [welcomeFilePath] })
    } else {
      windowManager.restoreWindows()
    }
  })
}
