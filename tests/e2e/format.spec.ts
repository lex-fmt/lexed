import { test, expect, loc, resetFormattingRequest, expectFormattingRequest } from './lib'
import { openFixture } from './helpers'

const FORMATTER_SETTINGS = {
  sessionBlankLinesBefore: 1,
  sessionBlankLinesAfter: 1,
  normalizeSeqMarkers: true,
  unorderedSeqMarker: '-',
  maxBlankLines: 2,
  indentString: '    ',
  preserveTrailingBlanks: false,
  normalizeVerbatimMarkers: true,
  formatOnSave: false
}

const EXPECTED_PROPERTIES = {
  'lex.session_blank_lines_before': 1,
  'lex.session_blank_lines_after': 1,
  'lex.normalize_seq_markers': true,
  'lex.unordered_seq_marker': '-',
  'lex.max_blank_lines': 2,
  'lex.indent_string': '    ',
  'lex.preserve_trailing_blanks': false,
  'lex.normalize_verbatim_markers': true
}

test.describe('Format Document', () => {
  test('formats document via toolbar button and sends correct options', async ({ page }) => {
    await openFixture(page, 'format-basic.lex')
    await page.evaluate(
      (settings) => (window as any).ipcRenderer.setFormatterSettings?.(settings),
      FORMATTER_SETTINGS
    )

    await resetFormattingRequest(page)
    await loc.formatButton(page).click()

    // Verify the formatter was invoked with the correct settings.
    // Formatting logic correctness is tested in the lex-core crate;
    // here we verify the LSP integration path works end-to-end.
    const request = await expectFormattingRequest(page, {
      type: 'document',
      options: {
        tabSize: 4,
        insertSpaces: true,
        ...EXPECTED_PROPERTIES
      }
    })
    expect(request?.type).toBe('document')
  })

  test('formats document via application menu command', async ({ electronApp, page }) => {
    await openFixture(page, 'format-basic.lex')
    await page.evaluate(
      (settings) => (window as any).ipcRenderer.setFormatterSettings?.(settings),
      FORMATTER_SETTINGS
    )

    await resetFormattingRequest(page)
    await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      menu?.getMenuItemById('menu-format')?.click()
    })

    await expectFormattingRequest(page, { type: 'document' })
  })

  test('format button is disabled when no file is open', async ({ page }) => {
    await expect(loc.formatButton(page)).toBeVisible()
    await expect(loc.formatButton(page)).toBeDisabled()
  })
})
