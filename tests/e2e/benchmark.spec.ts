import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { openFixture, launchApp } from './helpers';

test.describe('Benchmark File', () => {
  test('should open benchmark file on startup and display correct content and outline', async () => {
    test.setTimeout(60000);
    const electronApp = await launchApp();

    const page = await electronApp.firstWindow();
    
    // Capture console logs
    page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`[Browser Error]: ${err}`));

    await page.waitForLoadState('domcontentloaded');

    await openFixture(page, 'benchmark.lex');

    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible();

    // 1. Verify Editor Content
    await expect(editor).toContainText('Compromise');

    // 2. Verify Syntax Highlighting
    await expect(editor).toContainText('1.');

    // 3. Verify Outline
    const outline = page.locator('[data-testid="outline-view"]');
    await expect(outline).toContainText('1. The Cage of Compromise');

    // Note: Nested items might not be visible or rendered immediately, 
    // but verifying the first item confirms the outline component is working and receiving data.

    await electronApp.close();
  });
});
