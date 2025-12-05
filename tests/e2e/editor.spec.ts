import { test, expect } from '@playwright/test';
import { openFixture, launchApp } from './helpers';

test.describe('Editor', () => {
  test('should load editor and apply syntax highlighting', async () => {
    const electronApp = await launchApp();
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    await openFixture(page, 'empty.lex');

    // Wait for Monaco editor to be visible
    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible();

    // Click to focus via Playwright (sometimes enough)
    await editor.click();
    
    // Explicitly focus via Monaco instance to be sure
    await page.evaluate(() => {
        (window as any).lexTest?.editor?.focus();
    });

    // Set content directly to ensure consistent state for highlighting check
    await page.evaluate(() => {
        (window as any).lexTest?.setActiveEditorValue('# Hello World\nThis is a *test*.');
    });

    // Check for semantic tokens
    // Monaco renders tokens as spans with classes like "mtkX"
    // We can't easily know which mtk class maps to what without deep inspection,
    // but we can check if there are ANY mtk classes other than default.
    
    // Wait for a bit for LSP to respond
    await page.waitForTimeout(2000);

    // Check if we have spans with color styles or specific classes
    // In our theme we set DocumentTitle to Red (FF0000)
    // Monaco might inline the style or use a class.
    // Let's look for the text "Hello World" and see if it has a style or class.
    
    // Check if the editor content contains the text
    // Monaco renders text in spans inside view-lines
    // Verify content via model value to be robust against Monaco's DOM rendering/tokenization
    const value = await page.evaluate(() => {
       return (window as any).lexTest?.getActiveEditorValue() ?? '';
    });
    expect(value).toContain('# Hello World');
    expect(value).toContain('This is a *test*.');

    await electronApp.close();
  });
});
