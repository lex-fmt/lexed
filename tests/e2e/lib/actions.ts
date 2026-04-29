import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import * as loc from './locators'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

/** Focus the Monaco editor: click + programmatic focus via test bridge. */
export async function focusEditor(page: Page): Promise<void> {
  await loc.editor(page).click()
  await page.evaluate(() => window.__e2e.bridge.focusEditor())
}

/** Focus the editor and type text. */
export async function typeInEditor(page: Page, text: string): Promise<void> {
  await focusEditor(page)
  await page.keyboard.type(text)
}

// ---------------------------------------------------------------------------
// Settings dialog
// ---------------------------------------------------------------------------

/** Open the settings dialog via the toolbar button. */
export async function openSettings(page: Page): Promise<void> {
  await loc.settingsButton(page).click()
  await expect(loc.settingsHeading(page)).toBeVisible()
}

/** Save and close the settings dialog. */
export async function closeSettings(page: Page): Promise<void> {
  await loc.saveChangesButton(page).click()
  await expect(loc.settingsHeading(page)).toBeHidden()
}

// ---------------------------------------------------------------------------
// Settings reset
// ---------------------------------------------------------------------------

type SettingsOverrides = {
  editor?: Partial<{
    showRuler: boolean
    rulerWidth: number
    vimMode: boolean
  }>
  formatter?: Partial<{
    sessionBlankLinesBefore: number
    sessionBlankLinesAfter: number
    normalizeSeqMarkers: boolean
    unorderedSeqMarker: string
    maxBlankLines: number
    indentString: string
    preserveTrailingBlanks: boolean
    normalizeVerbatimMarkers: boolean
    formatOnSave: boolean
  }>
  spellcheck?: Partial<{
    enabled: boolean
    language: string
  }>
}

const DEFAULT_EDITOR = { showRuler: false, rulerWidth: 100, vimMode: false }
const DEFAULT_FORMATTER = {
  sessionBlankLinesBefore: 1,
  sessionBlankLinesAfter: 1,
  normalizeSeqMarkers: true,
  unorderedSeqMarker: '-',
  maxBlankLines: 2,
  indentString: '    ',
  preserveTrailingBlanks: false,
  normalizeVerbatimMarkers: true,
  formatOnSave: false,
}
const DEFAULT_SPELLCHECK = { enabled: true, language: 'en_US' }

/** Reset all app settings to defaults with optional overrides. */
export async function resetSettings(page: Page, overrides?: SettingsOverrides): Promise<void> {
  const editor = { ...DEFAULT_EDITOR, ...overrides?.editor }
  const formatter = { ...DEFAULT_FORMATTER, ...overrides?.formatter }
  const spellcheck = { ...DEFAULT_SPELLCHECK, ...overrides?.spellcheck }

  await page.evaluate(
    async (s) => {
      const ipc = (window as any).ipcRenderer
      await ipc.setEditorSettings(s.editor)
      await ipc.setFormatterSettings(s.formatter)
      await ipc.setSpellcheckSettings(s.spellcheck)
    },
    { editor, formatter, spellcheck }
  )
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

type WorkspaceFile = {
  /** Relative path within the workspace, e.g. 'notes/entry.lex' */
  relativePath: string
  content: string
}

type WorkspaceHandle = {
  path: string
  cleanup: () => void
}

/**
 * Create a temp workspace, write files, and open it via `lexTest.openFolder`.
 * Returns a handle with the workspace path and a cleanup function.
 */
export async function openWorkspace(
  page: Page,
  files: WorkspaceFile[],
  prefix = 'lexed-test-workspace-'
): Promise<WorkspaceHandle> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))

  for (const file of files) {
    const filePath = path.join(root, file.relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, file.content)
  }

  await page.evaluate(async (dirPath) => window.__e2e.bridge.openFolder(dirPath), root)

  // Wait for the file tree to reflect the workspace
  await expect(loc.fileTree(page)).toBeVisible({ timeout: 15000 })

  return {
    path: root,
    cleanup: () => {
      try {
        fs.rmSync(root, { recursive: true, force: true })
      } catch {
        // Ignore cleanup failures
      }
    },
  }
}
