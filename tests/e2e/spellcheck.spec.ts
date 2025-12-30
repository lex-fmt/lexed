import { test, expect } from '@playwright/test'
import { openFixture, launchApp } from './helpers'
import path from 'path'
import * as fs from 'fs/promises'

test.describe('Spellcheck', () => {
  test('should show diagnostics for misspelled words and support language switching', async () => {
    // Increase timeout for this test as it involves language switching and waiting for diagnostics
    test.setTimeout(60000)
    const electronApp = await launchApp()
    const page = await electronApp.firstWindow()
    page.on('console', (msg) => console.log(`renderer: ${msg.text()}`))
    await page.waitForLoadState('domcontentloaded')
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
    await page.keyboard.press('Backspace') // Undo the space, but change event fired

    // Helper to check markers via API to avoid UI flakiness
    const expectUnknownWord = async (word: string) => {
      // Wait for markers to appear
      await expect
        .poll(
          async () => {
            return await page.evaluate(() => {
              return (window as any).lexTest?.getMarkers() || []
            })
          },
          {
            timeout: 10000,
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
      // Check that markers do NOT contain the word
      const markers = await page.evaluate(() => {
        return (window as any).lexTest?.getMarkers() || []
      })
      const found = markers.some((m: any) => m.message.includes(`Unknown word: ${word}`))
      expect(found, `Expected "${word}" to be valid (no error)`).toBe(false)
    }

    // 1. Default Language (assumed en_US)
    // "mispelled" should be error
    await expectUnknownWord('mispelled')

    // "word" should be valid
    await expectWordValid('word')

    // 2. Switch to Portuguese
    await page.evaluate(async () => {
      await (window as any).ipcRenderer.setSpellcheckSettings({ enabled: true, language: 'pt_BR' })
    })

    // Wait for diagnostics to update. usually fast but give it a moment
    await page.waitForTimeout(2000)

    // "palavrra" should be error (palavra is correct)
    await expectUnknownWord('palavrra')

    // "errada" should be valid
    await expectWordValid('errada')

    // "word" might be an error in Portuguese? "word" is not in PT dictionary.
    // So "word" should be unknown.
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
    // We need a unique data dir for this test to verify persistence
    // "lex-lsp" uses LEX_TEST_DATA_DIR to override the data directory
    // We can pass this env var to the app
    const testDataDir = path.resolve(
      process.cwd(),
      '..',
      'target',
      'e2e-data',
      `spell-${Date.now()}`
    )
    await fs.mkdir(testDataDir, { recursive: true })

    console.log(`Using test data dir: ${testDataDir}`)

    const electronApp = await launchApp({
      env: {
        LEX_LSP_PATH: path.resolve('resources', 'lex-lsp'), // Explicitly use our copied binary
        LEX_TEST_DATA_DIR: testDataDir,
        // Disable welcome logic to speed up
        LEX_DISABLE_PERSISTENCE: '1',
      },
    })
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
      const misspelled = 'foobarbaz' // very unlikely to be in dictionary
      await editor.click()
      // Use keyboard to ensure events fire
      await page.keyboard.press('Control+End') // Go to end
      await page.keyboard.press('Enter')
      await page.keyboard.type(misspelled)
      await page.keyboard.type(' ') // Trigger check

      // Helper to wait for marker
      const waitForMarker = async (word: string, exists: boolean) => {
        await expect
          .poll(
            async () => {
              const markers = await page.evaluate(() => (window as any).lexTest?.getMarkers() || [])
              return markers.some((m: any) => m.message.includes(`Unknown word: ${word}`))
            },
            { timeout: 10000, message: `Waiting for marker "${word}" to be ${exists}` }
          )
          .toBe(exists)
      }

      // Check marker exists
      await waitForMarker(misspelled, true)

      // Log cursor and markers
      await page.evaluate(async () => {
        const markers = (window as any).lexTest?.getMarkers() || []
        console.log('[Test Debug] Markers:', markers)

        const marker = markers.find((m: any) => m.message.includes('foobarbaz'))
        if (marker) {
          console.log('[Test Debug] Moving to marker:', marker)
          // Use setCursor helper we just added
          const success = (window as any).lexTest?.setCursor(
            marker.startLineNumber,
            marker.startColumn + 1
          )
          console.log('[Test Debug] setCursor result:', success)
        } else {
          console.error('[Test Debug] Marker not found!')
        }
      })

      // Trigger standard Quick Fix menu (Cmd+. or Ctrl+.)
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
      await page.keyboard.press(`${modifier}+.`)

      // Wait for the quick fix menu to appear
      await page.waitForSelector('.context-view-block', { state: 'visible', timeout: 10000 })

      // Wait for widget - look for partial match since title is "Add 'foobarbaz' to dictionary"
      const widget = page.locator('.monaco-list-row').filter({ hasText: 'to dictionary' })
      await expect(widget).toBeVisible({ timeout: 10000 })

      // 5. Select "Add to dictionary" - use keyboard as Monaco has pointer-blocking overlay
      // Navigate to the "Add to dictionary" option using arrow keys
      // For an unknown word like "foobarbaz", there may be no suggestions, so it might be first
      // Use ArrowDown to navigate through items until we find the right one, then Enter
      // Or use End to go to last item directly
      for (let i = 0; i < 5; i++) {
        // Check if the "to dictionary" item is focused
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

      // 6. Verify marker disappears
      await waitForMarker(misspelled, false)

      // 7. Verify file on disk
      const customDicPath = path.join(testDataDir, 'dictionaries', 'custom.dic')
      // Wait a bit for file write
      await expect
        .poll(async () => {
          try {
            return await fs.readFile(customDicPath, 'utf8')
          } catch {
            return ''
          }
        })
        .toContain(misspelled)
    } finally {
      await electronApp.close()
      // Cleanup
      try {
        await fs.rm(testDataDir, { recursive: true, force: true })
      } catch (e) {
        console.error('Failed to cleanup test data dir:', e)
      }
    }
  })
})
