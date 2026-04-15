import {
  test,
  expect,
  loc,
  waitForEditorContent,
  resetFormattingRequest,
  expectFormattingRequest,
} from './lib'
import { openFixture } from './helpers'

const UNFORMATTED_CONTENT = `Hello This is a title


  There are many blank lines that shoule be squashed to 1 or 2.
  Next we will have a list with bad ordering, which the formatter should also fix.

  1. Hi Mom
  3. There
  8. Something


  `

const EXPECTED_PROPERTIES = {
  'lex.session_blank_lines_before': 1,
  'lex.session_blank_lines_after': 1,
  'lex.normalize_seq_markers': true,
  'lex.unordered_seq_marker': '-',
  'lex.max_blank_lines': 2,
  'lex.indent_string': '    ',
  'lex.preserve_trailing_blanks': false,
  'lex.normalize_verbatim_markers': true,
}

const FORMATTER_SETTINGS = {
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

test.describe('Format Document', () => {
  test('formats document via toolbar button and records formatter options', async ({ page }) => {
    await openFixture(page, 'format-basic.lex')
    await page.evaluate(
      (settings) => (window as any).ipcRenderer.setFormatterSettings?.(settings),
      FORMATTER_SETTINGS
    )

    await page.evaluate(({ content }) => (window as any).lexTest?.setActiveEditorValue?.(content), {
      content: UNFORMATTED_CONTENT,
    })
    await waitForEditorContent(page, 'Hello This is a title')

    const beforeFormat = await page.evaluate(
      () => (window as any).lexTest?.getActiveEditorValue() ?? ''
    )
    expect(beforeFormat).toBe(UNFORMATTED_CONTENT)

    await resetFormattingRequest(page)
    await loc.formatButton(page).click()

    const request = await expectFormattingRequest(page, {
      type: 'document',
      options: {
        tabSize: 4,
        insertSpaces: true,
        ...EXPECTED_PROPERTIES,
      },
    })
    expect(request?.type).toBe('document')

    const contentAfter = await page.evaluate(
      () => (window as any).lexTest?.getActiveEditorValue() ?? ''
    )
    expect(contentAfter).not.toEqual(UNFORMATTED_CONTENT)
    expect(contentAfter.trim().length).toBeGreaterThan(0)
  })

  test('formats document via application menu command', async ({ electronApp, page }) => {
    await openFixture(page, 'format-basic.lex')
    await page.evaluate(
      (settings) => (window as any).ipcRenderer.setFormatterSettings?.(settings),
      FORMATTER_SETTINGS
    )

    await page.evaluate(({ content }) => (window as any).lexTest?.setActiveEditorValue?.(content), {
      content: UNFORMATTED_CONTENT,
    })
    await waitForEditorContent(page, 'Hello This is a title')

    await resetFormattingRequest(page)
    await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      menu?.getMenuItemById('menu-format')?.click()
    })

    await expectFormattingRequest(page, { type: 'document' })

    const contentAfter = await page.evaluate(
      () => (window as any).lexTest?.getActiveEditorValue() ?? ''
    )
    expect(contentAfter).not.toEqual(UNFORMATTED_CONTENT)
  })

  test('format button is disabled when no file is open', async ({ page }) => {
    await expect(loc.formatButton(page)).toBeVisible()
    await expect(loc.formatButton(page)).toBeDisabled()
  })
})
