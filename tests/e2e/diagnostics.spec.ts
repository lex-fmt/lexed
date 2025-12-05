import { test, expect } from '@playwright/test';
import { openFixture, launchApp } from './helpers';

test.describe('Diagnostics', () => {
  test('should show mock diagnostics', async () => {
    const electronApp = await launchApp();

    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await openFixture(page, 'diagnostics.lex');

    // Wait for editor
    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible();

    await page.evaluate(() => window.lexTest?.triggerMockDiagnostics());

    // Check for squiggly error
    // Monaco renders squigglies with class .cdr-error or .squiggly-error
    // Let's check for .squiggly-error
    const squiggly = page.locator('.squiggly-error');
    await expect(squiggly).toBeVisible();

    await electronApp.close();
  });
});
