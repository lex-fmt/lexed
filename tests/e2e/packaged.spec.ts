/**
 * Smoke test for the packaged binary. NOT run by the default
 * `npm run test:e2e` — only via the `packaged` Playwright project,
 * and only after `npm run build` has produced the binary.
 *
 * Why this exists: catches "ships but won't launch" regressions —
 * electron-builder produces a binary that signs cleanly but crashes
 * on first run, fails to find its bundled lexd-lsp, fails to mount
 * the renderer, etc. CI's release workflow runs this on each platform
 * runner AFTER electron-builder packages the app and BEFORE Apple
 * notarization, so we don't pay the notarization cost on a binary
 * that's known broken.
 *
 * The binary path differs per platform. CI's release workflow passes
 * `PACKAGED_APP_PATH` to point at the platform-specific unpacked
 * binary:
 *
 *   - macOS:   release/mac-arm64/LexEd.app/Contents/MacOS/LexEd
 *   - Linux:   release/linux-unpacked/lexed
 *   - Windows: release\win-unpacked\LexEd.exe
 *
 * Local default (no env): macOS arm64 layout, the most common
 * developer machine.
 *
 * Unlike the dev-mode fixture in `tests/e2e/lib/app.ts`, this test
 * launches the packaged executable directly via
 * `electron.launch({ executablePath })`. It does NOT set
 * `LEX_LSP_PATH` — the packaged app must discover lexd-lsp from its
 * own bundled Resources (Contents/Resources/lexd-lsp on macOS,
 * resources/lexd-lsp on linux/win); discovering it is exactly what
 * this test verifies. It does NOT set `LEX_HIDE_WINDOW` or
 * `LEX_DISABLE_PERSISTENCE` either; the smoke test wants the renderer
 * actually rendering and the app able to write its first-run state.
 */
import {
  _electron as electron,
  expect,
  test,
  type ConsoleMessage,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')

/**
 * Resolve the packaged binary path. Honor `PACKAGED_APP_PATH` if set
 * (CI matrix passes it per-platform); otherwise default to the
 * macOS arm64 layout for local runs after `npm run build`.
 */
function resolveAppPath(): string {
  const override = process.env.PACKAGED_APP_PATH
  if (override) {
    return path.isAbsolute(override) ? override : path.join(repoRoot, override)
  }
  if (process.platform === 'linux') {
    return path.join(repoRoot, 'release/linux-unpacked/lexed')
  }
  if (process.platform === 'win32') {
    return path.join(repoRoot, 'release', 'win-unpacked', 'LexEd.exe')
  }
  return path.join(repoRoot, 'release/mac-arm64/LexEd.app/Contents/MacOS/LexEd')
}

const appPath = resolveAppPath()

test.skip(
  !fs.existsSync(appPath),
  `packaged app not found at ${appPath} — run \`npm run build\` first.`
)

let app: ElectronApplication
let page: Page

/**
 * lexed shows a splash window (data: URL with embedded HTML and logo)
 * BEFORE the editor opens in a separate BrowserWindow. `firstWindow()`
 * returns the splash; the editor is window #2. Filter on URL prefix to
 * find the editor window — splash is `data:`, editor is `file:` (in
 * the packaged build) or `http:` (in dev).
 */
async function waitForEditorWindow(
  application: ElectronApplication,
  timeoutMs = 45_000
): Promise<Page> {
  const isEditor = (w: Page) => {
    const url = w.url()
    return url.length > 0 && !url.startsWith('data:')
  }
  // Check current windows first — the editor may already be open if
  // the splash has closed by the time we're called.
  for (const w of application.windows()) {
    if (isEditor(w)) {
      await w.waitForLoadState('domcontentloaded')
      return w
    }
  }
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - start)
    const next = await application.waitForEvent('window', {
      timeout: Math.max(remaining, 1000),
    })
    if (isEditor(next)) {
      await next.waitForLoadState('domcontentloaded')
      return next
    }
    // It was another splash/transient — keep waiting.
  }
  throw new Error(`No editor window appeared within ${timeoutMs}ms`)
}

test.beforeAll(async () => {
  app = await electron.launch({
    executablePath: appPath,
    args: [],
    // The packaged-mode env intentionally OVERRIDES three vars that the
    // dev-mode launch helper sets:
    //
    // - LEX_LSP_PATH: must be unset so the app's packaged-mode resolver
    //   picks up the bundled `lexd-lsp` from Resources/, which is the
    //   thing this smoke test is verifying actually works.
    // - LEX_HIDE_WINDOW: cleared so the renderer is visible to Playwright.
    // - LEX_DISABLE_PERSISTENCE: cleared so the app can complete first-run
    //   initialization (writing user-data dirs) on the runner.
    env: {
      ...process.env,
      LEX_LSP_PATH: '',
      LEX_HIDE_WINDOW: '',
      LEX_DISABLE_PERSISTENCE: '',
    },
  })
  page = await waitForEditorWindow(app)
  // Surface browser-side logs to the test runner's output so a CI
  // failure has the renderer/main-process trail readily available.
  page.on('console', (msg: ConsoleMessage) =>
    console.log(`[browser console] ${msg.type()}: ${msg.text()}`)
  )
  page.on('pageerror', (err: Error) =>
    console.log(`[browser pageerror] ${err.message}\n${err.stack ?? ''}`)
  )
})

test.afterAll(async () => {
  await app?.close()
})

test('packaged app renders the editor pane', async () => {
  // editor-pane testid is the load-bearing renderer element — if it
  // shows up, the React tree mounted, the bundled assets resolved,
  // and the workspace shell rendered. lexed renders two editor panes
  // by default (split view); `.first()` asserts at least one is up.
  await expect(page.getByTestId('editor-pane').first()).toBeVisible({ timeout: 30_000 })
})

test('packaged app initializes the bundled lexd-lsp', async () => {
  // `window.__lexLspReady` is set by lexed's renderer once the LSP
  // server has responded to its initialize request. If this never
  // becomes true, the bundled lexd-lsp wasn't found, didn't start,
  // or its handshake failed — exactly the class of "ships but doesn't
  // work" regression this smoke test catches.
  await page.waitForFunction(
    () => Boolean((window as unknown as { __lexLspReady?: boolean }).__lexLspReady),
    null,
    { timeout: 30_000 }
  )
})

test('packaged app captures a screenshot of its initial state', async () => {
  const outDir = path.join(repoRoot, 'tests/__screenshots__/packaged')
  fs.mkdirSync(outDir, { recursive: true })
  const platform = process.env.PACKAGED_PLATFORM_LABEL ?? process.platform
  await page.screenshot({
    path: path.join(outDir, `${platform}-initial.png`),
    fullPage: true,
  })
})
