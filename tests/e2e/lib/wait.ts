import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Wait for the LSP client to complete initialization.
 * Replaces all `waitForTimeout(2000) // Wait for LSP` calls.
 */
export async function waitForLsp(page: Page, timeout = 15000) {
  await page.waitForFunction(() => Boolean((window as any).__lexLspReady), null, { timeout })
}

/**
 * Wait for the Monaco editor to be visible AND the LSP to be ready.
 * This is the most common setup sequence — replaces the
 * `expect(editor).toBeVisible(); waitForTimeout(2000)` pair.
 */
export async function waitForEditor(page: Page, timeout = 15000) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout })
  await waitForLsp(page, timeout)
}

/**
 * Wait until the active editor's model value satisfies a predicate.
 * Uses page.waitForFunction for Playwright's built-in retry/timeout.
 */
export async function waitForEditorContent(
  page: Page,
  predicate: string,
  { timeout = 10000 } = {}
) {
  await page.waitForFunction(
    (text) => {
      const value = (window as any).lexTest?.getActiveEditorValue() ?? ''
      return value.includes(text)
    },
    predicate,
    { timeout }
  )
}

/**
 * Wait for the spellcheck engine to be ready (dictionary loaded, service initialized).
 */
export async function waitForSpellcheck(page: Page, timeout = 20000) {
  await page.waitForFunction(() => Boolean((window as any).lexTest?.isSpellcheckReady?.()), null, {
    timeout,
  })
}
