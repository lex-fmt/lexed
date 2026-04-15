import { test, expect, loc, resetSettings, focusEditor, expectMarkers } from './lib'
import { openFixture } from './helpers'

test.describe('Spellcheck', () => {
  test('should show diagnostics for misspelled words and support language switching', async ({
    page,
  }) => {
    test.setTimeout(90000)

    await resetSettings(page, { spellcheck: { enabled: true, language: 'en_US' } })

    await openFixture(page, 'spellcheck-test.lex')

    // Trigger validation
    await focusEditor(page)
    await page.keyboard.type(' ')
    await page.keyboard.press('Backspace')

    // 1. Default Language (en_US) — "mispelled" should be flagged
    await expectMarkers(page, [{ message: 'Unknown word: mispelled' }], { timeout: 20000 })

    // "word" should be valid (no marker for it)
    const markersEn = await page.evaluate(() => {
      const lt = (window as any).lexTest
      if (!lt) return []
      lt.recheckSpelling()
      return (lt.getMarkers() || []).map((m: any) => m.message)
    })
    expect(markersEn.some((m: string) => m.includes('Unknown word: word'))).toBe(false)

    // 2. Switch to French
    await page.evaluate(async () => {
      await (window as any).ipcRenderer.setSpellcheckSettings({ enabled: true, language: 'fr_FR' })
    })

    await expectMarkers(page, [{ message: 'Unknown word: fautte' }], { timeout: 30000 })

    // "est" should be valid in French, "word" should be flagged
    const markersFr = await page.evaluate(() => {
      const lt = (window as any).lexTest
      if (!lt) return []
      lt.recheckSpelling()
      return (lt.getMarkers() || []).map((m: any) => m.message)
    })
    expect(markersFr.some((m: string) => m.includes('Unknown word: est'))).toBe(false)
    expect(markersFr.some((m: string) => m.includes('Unknown word: word'))).toBe(true)
  })

  test('allows switching languages from the status bar widget', async ({ page }) => {
    await resetSettings(page, { spellcheck: { enabled: true, language: 'en_US' } })

    await openFixture(page, 'spellcheck-test.lex')

    await expect(loc.spellButton(page)).toBeVisible()
    await expect(loc.spellButton(page)).toContainText('Spell: English (US)')

    await loc.spellButton(page).click()
    await expect(loc.spellMenu(page)).toBeVisible()

    await loc.spellMenu(page).getByTestId('status-spell-option-off').click()
    await expect(loc.spellButton(page)).toHaveText('Spell: off')

    await expect
      .poll(async () => {
        const settings = await page.evaluate(() => (window as any).ipcRenderer.getAppSettings())
        return settings.spellcheck.enabled
      })
      .toBe(false)

    await loc.spellButton(page).click()
    await expect(loc.spellMenu(page)).toBeVisible()
    await loc.spellMenu(page).getByTestId('status-spell-option-fr_FR').click()

    await expect(loc.spellButton(page)).toContainText('Spell: French')

    await expect
      .poll(async () => {
        const settings = await page.evaluate(() => (window as any).ipcRenderer.getAppSettings())
        return settings.spellcheck
      })
      .toMatchObject({ enabled: true, language: 'fr_FR' })
  })

  test('successfully adds words to dictionary', async ({ page }) => {
    test.setTimeout(60000)

    // Reset custom dictionary and enable spellcheck
    await page.evaluate(() => (window as any).ipcRenderer.invoke('spellcheck-reset-custom-words'))
    await resetSettings(page, { spellcheck: { enabled: true, language: 'en_US' } })

    await openFixture(page, 'spellcheck-test.lex')

    // Wait for initial markers
    await expectMarkers(page, [{ message: 'Unknown word: mispelled' }], { timeout: 20000 })

    // Type a misspelled word
    const misspelled = 'foobarbaz'
    await focusEditor(page)

    const goToEndKey = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End'
    await page.keyboard.press(goToEndKey)
    await page.keyboard.press('Enter')
    await page.keyboard.type(misspelled)
    await page.keyboard.type(' ')

    await expectMarkers(page, [{ message: `Unknown word: ${misspelled}` }], { timeout: 20000 })

    // Move cursor to the misspelled word
    await page.evaluate(async () => {
      const markers = (window as any).lexTest?.getMarkers() || []
      const marker = markers.find((m: any) => m.message.includes('foobarbaz'))
      if (marker) {
        ;(window as any).lexTest?.setCursor(marker.startLineNumber, marker.startColumn + 1)
      }
    })

    // Trigger Quick Fix menu
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+.`)

    await expect(loc.contextViewBlock(page)).toBeVisible({ timeout: 10000 })

    const widget = loc.monacoListRow(page).filter({ hasText: 'to dictionary' })
    await expect(widget).toBeVisible({ timeout: 10000 })

    for (let i = 0; i < 5; i++) {
      const focusedItem = await page
        .locator('.monaco-list-row.focused')
        .textContent()
        .catch(() => '')
      if (focusedItem && focusedItem.includes('to dictionary')) {
        break
      }
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(50) // tight keyboard nav timing — acceptable
    }
    await page.keyboard.press('Enter')

    // Verify marker disappears
    await expect
      .poll(
        async () => {
          return await page.evaluate((w) => {
            const lt = (window as any).lexTest
            if (!lt) return false
            lt.recheckSpelling()
            return (lt.getMarkers() || []).some((m: any) =>
              m.message.includes(`Unknown word: ${w}`)
            )
          }, misspelled)
        },
        { timeout: 20000, message: `Waiting for "${misspelled}" marker to disappear` }
      )
      .toBe(false)
  })
})
