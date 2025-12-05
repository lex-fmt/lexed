import { test, expect, _electron as electron, Page } from '@playwright/test';

const DEFAULT_EDITOR_SETTINGS = {
  showRuler: false,
  rulerWidth: 100,
  vimMode: false,
};

const DEFAULT_FORMATTER_SETTINGS = {
  sessionBlankLinesBefore: 1,
  sessionBlankLinesAfter: 1,
  normalizeSeqMarkers: true,
  unorderedSeqMarker: '-',
  maxBlankLines: 2,
  indentString: '    ',
  preserveTrailingBlanks: false,
  normalizeVerbatimMarkers: true,
  formatOnSave: false,
};

async function launchApp() {
  const electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      LEX_DISABLE_PERSISTENCE: '0',
      LEX_DISABLE_SINGLE_INSTANCE_LOCK: '1',
    },
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { electronApp, window };
}

async function resetAppSettings(page: Page) {
  await page.evaluate(async ({ editor, formatter }) => {
    await (window as any).ipcRenderer.setEditorSettings(editor);
    await (window as any).ipcRenderer.setFormatterSettings(formatter);
  }, { editor: DEFAULT_EDITOR_SETTINGS, formatter: DEFAULT_FORMATTER_SETTINGS });
}

async function openSettings(page: Page) {
  await page.click('button[title="Settings"]');
  await expect(page.locator('h2:has-text("Settings")')).toBeVisible();
}

async function saveAndCloseSettings(page: Page) {
  await page.click('text=Save Changes');
  await expect(page.locator('h2:has-text("Settings")')).toBeHidden();
}

test.describe('Settings', () => {
  test('loads latest formatter values when switching tabs', async () => {
    const { electronApp, window: page } = await launchApp();

    try {
      await resetAppSettings(page);
      await openSettings(page);

      const customFormatter = {
        sessionBlankLinesBefore: 4,
        sessionBlankLinesAfter: 3,
        normalizeSeqMarkers: false,
        unorderedSeqMarker: '+',
        maxBlankLines: 5,
        indentString: ' '.repeat(6),
        preserveTrailingBlanks: true,
        normalizeVerbatimMarkers: false,
        formatOnSave: true,
      };

      await page.evaluate(async (formatter) => {
        await (window as any).ipcRenderer.setFormatterSettings(formatter);
      }, customFormatter);

      await page.click('button:has-text("Formatter")');

      await expect(page.locator('input#session-before')).toHaveValue(String(customFormatter.sessionBlankLinesBefore));
      await expect(page.locator('input#session-after')).toHaveValue(String(customFormatter.sessionBlankLinesAfter));
      await expect(page.locator('input#max-blank-lines')).toHaveValue(String(customFormatter.maxBlankLines));
      await expect(page.locator('input#indent-spaces')).toHaveValue(String(customFormatter.indentString.length));
      await expect(page.locator('input#unordered-marker')).toHaveValue(customFormatter.unorderedSeqMarker);
      await expect(page.locator('label:has-text("Normalize list markers") input[type="checkbox"]')).not.toBeChecked();
      await expect(page.locator('label:has-text("Normalize verbatim markers") input[type="checkbox"]')).not.toBeChecked();
      await expect(page.locator('label:has-text("Preserve trailing blank lines") input[type="checkbox"]')).toBeChecked();
      await expect(page.locator('label:has-text("Format automatically on save") input[type="checkbox"]')).toBeChecked();
    } finally {
      await electronApp.close();
    }
  });

  test('persists UI and formatter settings after closing dialog', async () => {
    const { electronApp, window: page } = await launchApp();

    try {
      await resetAppSettings(page);
      await openSettings(page);

      const showRulerCheckbox = page.locator('input#show-ruler');
      await showRulerCheckbox.check();
      const rulerWidthInput = page.locator('input#ruler-width');
      await rulerWidthInput.fill('120');
      await page.locator('input#vim-mode').check();

      await page.click('button:has-text("Formatter")');
      await page.locator('input#session-before').fill('2');
      await page.locator('input#session-after').fill('3');
      await page.locator('input#max-blank-lines').fill('4');
      await page.locator('input#indent-spaces').fill('2');
      await page.locator('input#unordered-marker').fill('*');
      await page.locator('label:has-text("Normalize list markers") input[type="checkbox"]').uncheck();
      await page.locator('label:has-text("Normalize verbatim markers") input[type="checkbox"]').uncheck();
      await page.locator('label:has-text("Preserve trailing blank lines") input[type="checkbox"]').check();
      await page.locator('label:has-text("Format automatically on save") input[type="checkbox"]').check();

      await saveAndCloseSettings(page);

      await openSettings(page);
      await expect(page.locator('input#show-ruler')).toBeChecked();
      await expect(page.locator('input#ruler-width')).toHaveValue('120');
      await expect(page.locator('input#vim-mode')).toBeChecked();

      await page.click('button:has-text("Formatter")');
      await expect(page.locator('input#session-before')).toHaveValue('2');
      await expect(page.locator('input#session-after')).toHaveValue('3');
      await expect(page.locator('input#max-blank-lines')).toHaveValue('4');
      await expect(page.locator('input#indent-spaces')).toHaveValue('2');
      await expect(page.locator('input#unordered-marker')).toHaveValue('*');
      await expect(page.locator('label:has-text("Normalize list markers") input[type="checkbox"]')).not.toBeChecked();
      await expect(page.locator('label:has-text("Normalize verbatim markers") input[type="checkbox"]')).not.toBeChecked();
      await expect(page.locator('label:has-text("Preserve trailing blank lines") input[type="checkbox"]')).toBeChecked();
      await expect(page.locator('label:has-text("Format automatically on save") input[type="checkbox"]')).toBeChecked();

      const persistedSettings = await page.evaluate(async () => {
        return (window as any).ipcRenderer.getAppSettings();
      });
      expect(persistedSettings.editor.showRuler).toBe(true);
      expect(persistedSettings.editor.rulerWidth).toBe(120);
      expect(persistedSettings.editor.vimMode).toBe(true);
      expect(persistedSettings.formatter.sessionBlankLinesBefore).toBe(2);
      expect(persistedSettings.formatter.sessionBlankLinesAfter).toBe(3);
      expect(persistedSettings.formatter.maxBlankLines).toBe(4);
      expect(persistedSettings.formatter.indentString).toBe(' '.repeat(2));
      expect(persistedSettings.formatter.unorderedSeqMarker).toBe('*');
      expect(persistedSettings.formatter.normalizeSeqMarkers).toBe(false);
      expect(persistedSettings.formatter.normalizeVerbatimMarkers).toBe(false);
      expect(persistedSettings.formatter.preserveTrailingBlanks).toBe(true);
      expect(persistedSettings.formatter.formatOnSave).toBe(true);
    } finally {
      await electronApp.close();
    }
  });
});
