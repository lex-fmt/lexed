import { spawn, ChildProcess } from 'child_process'
import { WebContents, app, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Detect the lex workspace root by looking for the characteristic structure:
 * a directory containing core/, editors/, tools/ subdirectories.
 * Returns null if not in a lex workspace.
 */
function detectLexWorkspace(): string | null {
  const override = process.env.LEX_WORKSPACE_ROOT
  if (override && fs.existsSync(override)) {
    return path.resolve(override)
  }

  // Start from lexed repo and look for parent workspace
  let current = process.cwd()
  const { root } = path.parse(current)

  while (current !== root) {
    // Check for lex workspace structure: parent dir with core/, editors/, tools/
    const parent = path.dirname(current)
    if (
      fs.existsSync(path.join(parent, 'core')) &&
      fs.existsSync(path.join(parent, 'editors')) &&
      fs.existsSync(path.join(parent, 'tools'))
    ) {
      return parent
    }
    current = parent
  }

  return null
}

/**
 * Binary resolution priority:
 * 1. LEX_LSP_PATH env var (explicit override)
 * 2. Workspace binary at {workspace}/target/local/lex-lsp (dev convenience)
 * 3. Bundled/resources binary
 */
function resolveLspBinary(binaryName: string): { path: string; source: string; warning?: string } {
  // 1. Environment variable takes precedence
  const envPath = process.env.LEX_LSP_PATH
  if (envPath) {
    const resolved = path.resolve(envPath)
    if (fs.existsSync(resolved)) {
      return { path: resolved, source: 'env' }
    }
    return { path: resolved, source: 'env', warning: `LEX_LSP_PATH set but binary not found: ${resolved}` }
  }

  // 2. Check for workspace binary (dev mode)
  const workspace = detectLexWorkspace()
  if (workspace) {
    const workspaceBinary = path.join(workspace, 'target', 'local', binaryName)
    if (fs.existsSync(workspaceBinary)) {
      return { path: workspaceBinary, source: 'workspace' }
    }
    // Workspace detected but no binary - warn but continue to fallback
    const warning = `Lex workspace detected at ${workspace} but no dev binary found. Run ./scripts/build-local.sh to build it.`

    // 3. Fall back to resources binary
    const resourcesRoot = path.join(process.env.APP_ROOT ?? process.cwd(), 'resources')
    const resourcesBinary = path.join(resourcesRoot, binaryName)
    if (fs.existsSync(resourcesBinary)) {
      return { path: resourcesBinary, source: 'resources', warning }
    }

    return { path: resourcesBinary, source: 'resources', warning }
  }

  // 3. Resources binary (not in workspace)
  const resourcesRoot = path.join(process.env.APP_ROOT ?? process.cwd(), 'resources')
  const resourcesBinary = path.join(resourcesRoot, binaryName)
  return { path: resourcesBinary, source: 'resources' }
}

function resolveLogFile(): string {
  return path.join(app.getPath('userData'), 'lexed-lsp.log')
}

interface LspStatusPayload {
  status: 'starting' | 'missing-binary' | 'error' | 'stopped'
  message?: string
  path?: string
  code?: number | null
}

function log(message: string) {
  const write = () => {
    const target = resolveLogFile()
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.appendFileSync(target, `${new Date().toISOString()} - ${message}\n`)
  }

  if (app.isReady()) {
    write()
  } else {
    app
      .whenReady()
      .then(write)
      .catch(() => {
        // no-op if app shuts down before logging
      })
  }
}

export class LspManager {
  private lspProcess: ChildProcess | null = null
  private webContents: WebContents | null = null
  private rootPath: string | null = null

  constructor() {
    log('LspManager initialized')
  }

  private sendStatus(payload: LspStatusPayload) {
    if (this.webContents && !this.webContents.isDestroyed()) {
      this.webContents.send('lsp-status', payload)
    }
  }

  setWebContents(webContents: WebContents) {
    this.webContents = webContents
    // Clear reference when webContents is destroyed to prevent errors
    webContents.on('destroyed', () => {
      this.webContents = null
    })
  }

  start(rootPath?: string) {
    if (this.lspProcess) return

    this.rootPath = rootPath || null

    const binaryName = process.platform === 'win32' ? 'lex-lsp.exe' : 'lex-lsp'
    let lspPath: string
    let warning: string | undefined

    if (app.isPackaged) {
      // In production, the binary is in Resources
      lspPath = path.join(process.resourcesPath, binaryName)
    } else {
      const resolved = resolveLspBinary(binaryName)
      lspPath = resolved.path
      warning = resolved.warning
      log(`Binary resolution: source=${resolved.source}, path=${lspPath}`)
    }

    // Log warning about workspace without dev binary
    if (warning) {
      log(`Warning: ${warning}`)
      console.warn(warning)
    }

    if (!fs.existsSync(lspPath)) {
      const message = `Lex language server binary not found at ${lspPath}. Run scripts/download-lex-lsp.sh to fetch it.`
      log(message)
      dialog.showErrorBox('Lex LSP Missing', message)
      this.sendStatus({ status: 'missing-binary', message, path: lspPath })
      return
    }

    // TODO: Pass rootPath to LSP process if supported via args or env
    const env = { ...process.env }
    if (this.rootPath) {
      // Example: env['LEX_LSP_ROOT'] = this.rootPath;
    }

    const lspCwd = app.isPackaged ? process.resourcesPath : (process.env.APP_ROOT ?? process.cwd())

    this.sendStatus({ status: 'starting' })

    this.lspProcess = spawn(lspPath, [], {
      env,
      cwd: lspCwd,
    })

    this.lspProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString()
      // Truncate large LSP messages for cleaner logs
      const truncated = msg.length > 200 ? msg.slice(0, 200) + '... [truncated]' : msg
      console.log(`LSP Output: ${truncated}`)
      log(`LSP Output: ${truncated}`)
      // Check if webContents exists and is not destroyed before sending
      if (this.webContents && !this.webContents.isDestroyed()) {
        this.webContents.send('lsp-output', data)
      }
    })

    this.lspProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString()
      console.error(`LSP Stderr: ${msg}`)
      log(`LSP Stderr: ${msg}`)
    })

    this.lspProcess.on('exit', (code) => {
      console.log(`LSP exited with code ${code}`)
      log(`LSP exited with code ${code}`)
      this.sendStatus({ status: 'stopped', code: code ?? null })
      this.lspProcess = null
    })

    this.lspProcess.on('error', (err) => {
      const message = `Failed to start LSP process: ${err?.message ?? 'unknown error'}`
      console.error(message)
      log(message)
      this.sendStatus({ status: 'error', message })
    })
  }

  sendInput(data: string | Uint8Array) {
    if (this.lspProcess && this.lspProcess.stdin) {
      this.lspProcess.stdin.write(data)
    }
  }

  stop() {
    if (this.lspProcess) {
      this.lspProcess.kill()
      this.lspProcess = null
    }
  }
}
