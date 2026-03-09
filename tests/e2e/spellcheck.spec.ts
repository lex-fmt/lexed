import { test, expect } from '@playwright/test'
import { openFixture, launchApp } from './helpers'

test.describe('Spellcheck', () => {
  test('should show diagnostics for misspelled words and support language switching', async () => {
    test.setTimeout(60000)
    const electronApp = await launchApp()
    const page = await electronApp.firstWindow()
    page.on('console', (msg) => console.log(`renderer: ${msg.text()}`))
    await page.waitForLoadState('domcontentloaded')

    // Explicitly enable spellcheck
    await page.evaluate(async () => {
      await (window as any).ipcRenderer.setSpellcheckSettings({ enabled: true, language: 'en_US' })
    })

    await openFixture(page, 'spellcheck-test.lex')

    // Wait for editor
    const editor = page.locator('.monaco-editor').first()
    await expect(editor).toBeVisible({ timeout: 20000 })

    // Focus and Type a space to ensure validation triggers
    await editor.click()
    await page.keyboard.type(' ')
    await page.keyboard.press('Backspace')

    // Helper to check markers via API
    const expectUnknownWord = async (word: string) => {
      await expect
        .poll(
          async () => {
            return await page.evaluate(() => {
              return (window as any).lexTest?.getMarkers() || []
            })
          },
          {
            timeout: 15000,
            message: `Waiting for markers containing "${word}"`,
          }
        )
        .toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(`Unknown word: ${word}`),
            }),
          ])
        )
    }

    // Helper to ensure word is NOT flagged
    const expectWordValid = async (word: string) => {
      const markers = await page.evaluate(() => {
        return (window as any).lexTest?.getMarkers() || []
      })
      const found = markers.some((m: any) => m.message.includes(`Unknown word: ${word}`))
      expect(found, `Expected "${word}" to be valid (no error)`).toBe(false)
    }

    // 1. Default Language (en_US)
    await expectUnknownWord('mispelled')
    await expectWordValid('word')

    // 2. Switch to Portuguese
    await page.evaluate(async () => {
      await (window as any).ipcRenderer.setSpellcheckSettings({ enabled: true, language: 'pt_BR' })
    })

    // Wait for dictionary to load and re-check
    await page.waitForTimeout(3000)

    // Trigger re-check by modifying content
    await editor.click()
    await page.keyboard.type(' ')
    await page.keyboard.press('Backspace')

    await expectUnknownWord('palavrra')
    await expectWordValid('errada')
    await expectUnknownWord('word')

    await electronApp.close()
  })

  test('allows switching languages from the status bar widget', async () => {
    const electronApp = await launchApp()
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    try {
      await page.evaluate(async () => {
        await (window as any).ipcRenderer.setSpellcheckSettings({
          enabled: true,
          language: 'en_US',
        })
      })

      await openFixture(page, 'spellcheck-test.lex')

      const spellButton = page.getByTestId('status-spell-button').first()
      await expect(spellButton).toBeVisible()
      await expect(spellButton).toContainText('Spell: English (US)')

      await spellButton.click()
      const menu = page.getByTestId('status-spell-menu').first()
      await expect(menu).toBeVisible()

      await menu.getByTestId('status-spell-option-off').click()
      await expect(spellButton).toHaveText('Spell: off')

      await expect
        .poll(async () => {
          const settings = await page.evaluate(() => (window as any).ipcRenderer.getAppSettings())
          return settings.spellcheck.enabled
        })
        .toBe(false)

      await spellButton.click()
      await expect(menu).toBeVisible()
      await menu.getByTestId('status-spell-option-fr_FR').click()

      await expect(spellButton).toContainText('Spell: French')

      await expect
        .poll(async () => {
          const settings = await page.evaluate(() => (window as any).ipcRenderer.getAppSettings())
          return settings.spellcheck
        })
        .toMatchObject({ enabled: true, language: 'fr_FR' })
    } finally {
      await electronApp.close()
    }
  })

  test('successfully adds words to dictionary', async () => {
    const electronApp = await launchApp()
    const page = await electronApp.firstWindow()
    page.on('console', (msg) => console.log('renderer:', msg.text()))
    await page.waitForLoadState('domcontentloaded')

    try {
      // 1. Enable spellcheck
      await page.evaluate(async () => {
        await (window as any).ipcRenderer.setSpellcheckSettings({
          enabled: true,
          language: 'en_US',
        })
      })

      // 2. Open fixture
      await openFixture(page, 'spellcheck-test.lex')
      const editor = page.locator('.monaco-editor').first()
      await expect(editor).toBeVisible()

      // 3. Type a misspelled word
      const misspelled = 'foobarbaz'
      await editor.click()

      const goToEndKey = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End'
      await page.keyboard.press(goToEndKey)
      await page.keyboard.press('Enter')
      await page.keyboard.type(misspelled)
      await page.keyboard.type(' ')

      // Wait for spellcheck to run (debounced at 300ms + dictionary load)
      await page.waitForTimeout(1000)

      // Helper to wait for marker
      const waitForMarker = async (word: string, exists: boolean) => {
        await expect
          .poll(
            async () => {
              const markers = await page.evaluate(() => (window as any).lexTest?.getMarkers() || [])
              return markers.some((m: any) => m.message.includes(`Unknown word: ${word}`))
            },
            { timeout: 15000, message: `Waiting for marker "${word}" to be ${exists}` }
          )
          .toBe(exists)
      }

      // Check marker exists
      await waitForMarker(misspelled, true)

      // Move cursor to the misspelled word to trigger quick fix
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

      // Wait for the quick fix menu to appear
      await page.waitForSelector('.context-view-block', { state: 'visible', timeout: 10000 })

      // Find and click "Add to dictionary"
      const widget = page.locator('.monaco-list-row').filter({ hasText: 'to dictionary' })
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
        await page.waitForTimeout(50)
      }
      await page.keyboard.press('Enter')

      // Verify marker disappears
      await waitForMarker(misspelled, false)
    } finally {
      await electronApp.close()
    }
  })
})
