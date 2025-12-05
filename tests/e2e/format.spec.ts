import { test, expect } from '@playwright/test';
import { openFixture, launchApp } from './helpers';

const UNFORMATTED_CONTENT = `Hello This is a title



  There are many blank lines that shoule be squashed to 1 or 2.
  Next we will have a list with bad ordering, which the formatter should also fix.

  1. Hi Mom
  3. There
  8. Something


  `;

const EXPECTED_PROPERTIES = {
  'lex.session_blank_lines_before': 1,
  'lex.session_blank_lines_after': 1,
  'lex.normalize_seq_markers': true,
  'lex.unordered_seq_marker': '-',
  'lex.max_blank_lines': 2,
  'lex.indent_string': '    ',
  'lex.preserve_trailing_blanks': false,
  'lex.normalize_verbatim_markers': true,
};

test.describe('Format Document', () => {
  test('formats document via toolbar button and records formatter options', async () => {
    const electronApp = await launchApp();

    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await openFixture(page, 'format-basic.lex');
    await page.evaluate(() => (window as any).ipcRenderer.setFormatterSettings?.({
      sessionBlankLinesBefore: 1,
      sessionBlankLinesAfter: 1,
      normalizeSeqMarkers: true,
      unorderedSeqMarker: '-',
      maxBlankLines: 2,
      indentString: '    ',
      preserveTrailingBlanks: false,
      normalizeVerbatimMarkers: true,
      formatOnSave: false,
    }));

    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible();
    await page.waitForTimeout(2000);

    await page.evaluate(({ content }) => (window as any).lexTest?.setActiveEditorValue?.(content), { content: UNFORMATTED_CONTENT });
    await page.waitForTimeout(300);
    const beforeFormat = await page.evaluate(() => (window as any).lexTest?.getActiveEditorValue() ?? '');
    expect(beforeFormat).toBe(UNFORMATTED_CONTENT);

    const formatButton = page.locator('button[title="Format Document"]');
    await expect(formatButton).toBeVisible();
    await page.evaluate(() => {
      (window as any).lexTest?.resetFormattingRequest?.();
      (window as any).__lexLastFormattingRequest = null;
    });
    await formatButton.click();

    await page.waitForFunction(() => Boolean((window as any).__lexLastFormattingRequest));
    const formattingRequest = await page.evaluate(() => (window as any).__lexLastFormattingRequest);
    expect(formattingRequest?.type).toBe('document');
    expect(formattingRequest?.params?.options).toMatchObject({
      tabSize: 4,
      insertSpaces: true,
      ...EXPECTED_PROPERTIES,
    });

    const contentAfter = await page.evaluate(() => (window as any).lexTest?.getActiveEditorValue() ?? '');
    expect(contentAfter).not.toEqual(UNFORMATTED_CONTENT);
    expect(contentAfter.trim().length).toBeGreaterThan(0);

    await electronApp.close();
  });

  test('formats document via application menu command', async () => {
    const electronApp = await launchApp();

    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await openFixture(page, 'format-basic.lex');
    await page.evaluate(() => (window as any).ipcRenderer.setFormatterSettings?.({
      sessionBlankLinesBefore: 1,
      sessionBlankLinesAfter: 1,
      normalizeSeqMarkers: true,
      unorderedSeqMarker: '-',
      maxBlankLines: 2,
      indentString: '    ',
      preserveTrailingBlanks: false,
      normalizeVerbatimMarkers: true,
      formatOnSave: false,
    }));

    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible();
    await page.waitForTimeout(2000);

    await page.evaluate(({ content }) => (window as any).lexTest?.setActiveEditorValue?.(content), { content: UNFORMATTED_CONTENT });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      (window as any).lexTest?.resetFormattingRequest?.();
      (window as any).__lexLastFormattingRequest = null;
    });

    await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      menu?.getMenuItemById('menu-format')?.click();
    });

    await page.waitForFunction(() => Boolean((window as any).__lexLastFormattingRequest));
    const formattingRequest = await page.evaluate(() => (window as any).__lexLastFormattingRequest);
    expect(formattingRequest?.type).toBe('document');

    const contentAfter = await page.evaluate(() => (window as any).lexTest?.getActiveEditorValue() ?? '');
    expect(contentAfter).not.toEqual(UNFORMATTED_CONTENT);

    await electronApp.close();
  });

  test('format button is disabled when no file is open', async () => {
    const electronApp = await launchApp();

    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    const formatButton = page.locator('button[title="Format Document"]');
    await expect(formatButton).toBeVisible();
    await expect(formatButton).toBeDisabled();

    await electronApp.close();
  });
});
