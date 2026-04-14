import type { Page } from '@playwright/test'

// -- Editor --

export const editor = (page: Page) => page.locator('.monaco-editor').first()

// -- Toolbar buttons --
// These use title-based selectors today; as data-testid attributes are added
// in a follow-up PR, update these one place instead of every test.

export const formatButton = (page: Page) => page.locator('button[title="Format Document"]')
export const settingsButton = (page: Page) => page.locator('button[title="Settings"]')
export const previewButton = (page: Page) => page.locator('button[title="Preview"]')
export const convertToLexButton = (page: Page) => page.locator('button[title="Convert to Lex"]')
export const splitVerticalButton = (page: Page) => page.locator('button[title="Split vertically"]')
export const splitHorizontalButton = (page: Page) =>
  page.locator('button[title="Split horizontally"]')

// -- Settings dialog --

export const settingsHeading = (page: Page) => page.locator('h2:has-text("Settings")')
export const saveChangesButton = (page: Page) => page.locator('text=Save Changes')

// -- Status bar widgets --

export const spellButton = (page: Page) => page.getByTestId('status-spell-button').first()
export const spellMenu = (page: Page) => page.getByTestId('status-spell-menu').first()
export const vimButton = (page: Page) => page.getByTestId('status-vim-button').first()

// -- Panels --

export const fileTree = (page: Page) => page.locator('[data-testid="file-tree"]')
export const fileTreeItem = (page: Page, name: string | RegExp) =>
  page.locator('[data-testid="file-tree-item"]', { hasText: name })
export const outlineView = (page: Page) => page.locator('[data-testid="outline-view"]')
export const editorPanes = (page: Page) => page.locator('[data-testid="editor-pane"]')
export const editorTab = (page: Page, name: string | RegExp) =>
  page.locator('[data-testid="editor-tab"]', { hasText: name })

// -- Monaco internals (stable library selectors, centralized here) --

export const suggestWidget = (page: Page) => page.locator('.suggest-widget')
export const squigglyError = (page: Page) => page.locator('.squiggly-error')
export const contextViewBlock = (page: Page) => page.locator('.context-view-block')
export const monacoListRow = (page: Page) => page.locator('.monaco-list-row')

// -- Toast --

export const toast = (page: Page) => page.locator('[data-sonner-toast]')
