import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import * as loc from './locators'

type CompletionItem = {
  label?: string
  insertText?: string
  detail?: string
  kind?: number
}

type CompletionFilter = {
  label?: string | RegExp
  insertText?: string | RegExp
  detail?: string | RegExp
}

function matchesFilter(item: CompletionItem, filter: CompletionFilter): boolean {
  for (const [key, expected] of Object.entries(filter) as [
    keyof CompletionFilter,
    string | RegExp
  ][]) {
    const actual = item[key]
    if (actual === undefined) return false
    if (expected instanceof RegExp) {
      if (!expected.test(String(actual))) return false
    } else {
      if (String(actual) !== expected) return false
    }
  }
  return true
}

/** Read current completion items from the window global. */
export async function getCompletionItems(page: Page): Promise<CompletionItem[]> {
  return page.evaluate(() => {
    const sample = (window as any).__lexCompletionSample
    return Array.isArray(sample) ? sample : []
  })
}

/**
 * Focus editor, type text, trigger suggest, and wait for the widget to appear.
 */
export async function triggerCompletion(
  page: Page,
  text: string,
  { timeout = 10000 } = {}
): Promise<void> {
  await loc.editor(page).click()
  await page.evaluate(() => window.__e2e.bridge.focusEditor())
  await page.keyboard.type(text)
  await page.evaluate(() => window.__e2e.bridge.triggerSuggest())
  await expect(loc.suggestWidget(page)).toBeVisible({ timeout })
}

/** Poll completion items until one matches the filter. Returns the match. */
export async function expectCompletionItem(
  page: Page,
  filter: CompletionFilter,
  { timeout = 10000 } = {}
): Promise<CompletionItem> {
  let matched: CompletionItem | undefined
  await expect
    .poll(
      async () => {
        const items = await getCompletionItems(page)
        matched = items.find((item) => matchesFilter(item, filter))
        return matched
      },
      { timeout, message: `Waiting for completion item matching ${JSON.stringify(filter)}` }
    )
    .not.toBeUndefined()
  return matched!
}

/** Assert no completion item matches the filter (polls briefly to let items arrive). */
export async function expectNoCompletionItem(
  page: Page,
  filter: CompletionFilter,
  { timeout = 2000 } = {}
): Promise<void> {
  await expect
    .poll(
      async () => {
        const items = await getCompletionItems(page)
        return items.find((item) => matchesFilter(item, filter))
      },
      { timeout, message: `Expecting no completion item matching ${JSON.stringify(filter)}` }
    )
    .toBeUndefined()
}

/** Accept the currently selected completion by pressing Enter. */
export async function acceptCompletion(page: Page): Promise<void> {
  await page.keyboard.press('Enter')
}
