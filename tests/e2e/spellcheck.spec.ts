import { test, expect, Page } from '@playwright/test';
import { openFixture, launchApp } from './helpers';

test.describe('Spellcheck', () => {
  test('should show diagnostics for misspelled words and support language switching', async () => {
    // Increase timeout for this test as it involves language switching and waiting for diagnostics
    test.setTimeout(60000);
    const electronApp = await launchApp();
    const page = await electronApp.firstWindow();
    page.on('console', (msg) => console.log(`renderer: ${msg.text()}`));
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('domcontentloaded');
    
    // Explicitly enable spellcheck
    await page.evaluate(async () => {
       await (window as any).ipcRenderer.setSpellcheckSettings({ enabled: true, language: 'en_US' });
    });

    await openFixture(page, 'spellcheck-test.lex');

    // Wait for editor
    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible({ timeout: 20000 });
    
    // Focus and Type a space to ensure validation triggers
    await editor.click();
    await page.keyboard.type(' ');
    await page.keyboard.press('Backspace'); // Undo the space, but change event fired

    // Helper to check markers via API to avoid UI flakiness
    const expectUnknownWord = async (word: string) => {
       // Wait for markers to appear
       await expect.poll(async () => {
          return await page.evaluate(() => {
             return (window as any).lexTest?.getMarkers() || [];
          });
       }, {
         timeout: 10000,
         message: `Waiting for markers containing "${word}"`
       }).toEqual(expect.arrayContaining([
          expect.objectContaining({
             message: expect.stringContaining(`Unknown word: ${word}`)
          })
       ]));
    };
    
    // Helper to ensure word is NOT flagged
    const expectWordValid = async (word: string) => {
       // Check that markers do NOT contain the word
       const markers = await page.evaluate(() => {
          return (window as any).lexTest?.getMarkers() || [];
       });
       const found = markers.some((m: any) => m.message.includes(`Unknown word: ${word}`));
       expect(found, `Expected "${word}" to be valid (no error)`).toBe(false);
    };

    // 1. Default Language (assumed en_US)
    // "mispelled" should be error
    await expectUnknownWord('mispelled');
    
    // "word" should be valid
    await expectWordValid('word');

    // 2. Switch to Portuguese
    await page.evaluate(async () => {
       await (window as any).ipcRenderer.setSpellcheckSettings({ enabled: true, language: 'pt_BR' });
    });
    
    // Wait for diagnostics to update. usually fast but give it a moment
    await page.waitForTimeout(2000);

    // "palavrra" should be error (palavra is correct)
    await expectUnknownWord('palavrra');
    
    // "errada" should be valid
    await expectWordValid('errada');

    // "word" might be an error in Portuguese? "word" is not in PT dictionary.
    // So "word" should be unknown.
    await expectUnknownWord('word');

    await electronApp.close();
  });
});
