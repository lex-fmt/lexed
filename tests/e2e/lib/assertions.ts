import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

type MarkerMatch = {
  message?: string | RegExp
  severity?: 'error' | 'warning' | 'info' | 'hint'
  startLineNumber?: number
  source?: string
}

const SEVERITY_MAP = { error: 8, warning: 4, info: 2, hint: 1 } as const

function matchesMarker(
  actual: { message: string; severity: number; startLineNumber: number; source: string },
  match: MarkerMatch
): boolean {
  if (match.message instanceof RegExp) {
    if (!match.message.test(actual.message)) return false
  } else if (match.message !== undefined) {
    if (!actual.message.includes(match.message)) return false
  }
  if (match.severity !== undefined && actual.severity !== SEVERITY_MAP[match.severity]) return false
  if (match.startLineNumber !== undefined && actual.startLineNumber !== match.startLineNumber)
    return false
  if (match.source !== undefined && actual.source !== match.source) return false
  return true
}

/**
 * Assert on the markers (diagnostics) attached to the active editor model.
 * Uses the lexTest bridge to read markers directly from Monaco's API,
 * not from DOM squiggly classes.
 *
 * @param expected - Array of partial marker objects to match against.
 *   Each entry is matched independently; order doesn't matter.
 *   Pass an empty array to assert no markers exist.
 */
export async function expectMarkers(page: Page, expected: MarkerMatch[], { timeout = 10000 } = {}) {
  const getMarkers = () =>
    page.evaluate(() => {
      const markers = window.__e2e.bridge?.getMarkers?.() ?? []
      return markers.map((m: any) => ({
        message: m.message,
        severity: m.severity,
        startLineNumber: m.startLineNumber,
        source: m.source
      }))
    })

  if (expected.length === 0) {
    await expect
      .poll(getMarkers, { timeout, message: 'Waiting for markers to clear' })
      .toHaveLength(0)
    return
  }

  // Poll until all expected markers are found.
  // We serialize the expected matchers to pass into waitForFunction,
  // but since MarkerMatch can contain RegExp, we poll from the Node side.
  await expect
    .poll(
      async () => {
        const markers = await getMarkers()
        return expected.every((exp) => markers.some((m: any) => matchesMarker(m, exp)))
      },
      { timeout, message: 'Waiting for expected markers' }
    )
    .toBe(true)
}

/**
 * Reset the captured formatting request. Call this before triggering a format
 * action, then call expectFormattingRequest after the action to wait for the result.
 */
export async function resetFormattingRequest(page: Page) {
  await page.evaluate(() => {
    window.__e2e.bridge?.resetFormattingRequest?.()
  })
}

/**
 * Assert on the last formatting request captured by the test bridge.
 * Reads via window.__e2e.bridge.getLastFormattingRequest. Call
 * resetFormattingRequest() before the triggering action to avoid stale data.
 */
export async function expectFormattingRequest(
  page: Page,
  expected: { type?: 'document' | 'range'; options?: Record<string, unknown> },
  { timeout = 10000 } = {}
) {
  await page.waitForFunction(() => window.__e2e.bridge.getLastFormattingRequest?.() != null, null, {
    timeout
  })
  const request = (await page.evaluate(() => window.__e2e.bridge.getLastFormattingRequest?.())) as {
    type: 'document' | 'range'
    params: { options?: Record<string, unknown> }
  } | null
  if (expected.type !== undefined) {
    expect(request?.type).toBe(expected.type)
  }
  if (expected.options !== undefined) {
    expect(request?.params?.options).toMatchObject(expected.options)
  }
  return request
}

/**
 * Assert the active editor's model value equals or contains the expected text.
 * Reads via the lexTest bridge (model API), not DOM text content.
 */
export async function expectEditorValue(
  page: Page,
  expected: string | RegExp,
  { exact = false, timeout = 10000 } = {}
) {
  if (expected instanceof RegExp) {
    await expect
      .poll(() => page.evaluate(() => window.__e2e.bridge?.getActiveEditorValue() ?? ''), {
        timeout,
        message: 'Waiting for editor value to match pattern'
      })
      .toMatch(expected)
  } else if (exact) {
    await expect
      .poll(() => page.evaluate(() => window.__e2e.bridge?.getActiveEditorValue() ?? ''), {
        timeout,
        message: 'Waiting for exact editor value'
      })
      .toBe(expected)
  } else {
    await expect
      .poll(() => page.evaluate(() => window.__e2e.bridge?.getActiveEditorValue() ?? ''), {
        timeout,
        message: 'Waiting for editor value to contain text'
      })
      .toContain(expected)
  }
}

/**
 * Assert that a toast notification appeared with the given text.
 */
export async function expectToast(page: Page, text: string | RegExp, timeout = 10000) {
  const toastLocator = page.locator('[data-sonner-toast]')
  await expect(toastLocator).toBeVisible({ timeout })
  if (text instanceof RegExp) {
    await expect(toastLocator).toHaveText(text)
  } else {
    await expect(toastLocator).toContainText(text)
  }
}

/**
 * Assert that no renderer-side runtime errors have been captured so far
 * in this test. Callable mid-test after an action that should be
 * error-free; the fixture also auto-asserts on teardown so missing this
 * call doesn't hide errors.
 */
export function assertNoRuntimeErrors(
  errors: ReadonlyArray<{ source: string; message: string }>,
  context?: string
) {
  if (errors.length === 0) return
  const lines = errors.map((e, i) => `  [${i + 1}] (${e.source}) ${e.message}`)
  throw new Error(
    `${context ? context + ': ' : ''}runtime errors captured (${errors.length}):\n${lines.join('\n')}`
  )
}
