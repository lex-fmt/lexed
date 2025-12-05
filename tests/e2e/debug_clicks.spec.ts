import { test } from '@playwright/test';
import * as path from 'path';
import { openFixture, launchApp } from './helpers';

type Position = { lineNumber: number; column: number };

type EditorModel = {
  getWordAtPosition: (pos: Position) => { word: string } | null;
  getOffsetAt: (pos: Position) => number;
  getValue: () => string;
  getLanguageId: () => string;
};

type EditorHandle = {
  setPosition: (pos: Position) => void;
  revealPosition: (pos: Position) => void;
  getModel?: () => EditorModel | null;
};

type TokenInfo = { offset: number; type: string; language: string };

type DebugWindow = Window & {
  editor?: EditorHandle;
  monaco?: typeof import('monaco-editor');
};

test.describe('Debug Clicks', () => {
  test('should log token info on clicks', async () => {
    const app = await launchApp();

    const page = await app.firstWindow();
    page.on('console', (msg) =>
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`)
    );
    await page.waitForLoadState('domcontentloaded');

    await openFixture(page, 'benchmark.lex');

    // Wait for editor to be ready
    await page.waitForSelector('.monaco-editor');
    await page.waitForTimeout(2000); // Give LSP time to initialize

    const clicks = [
      { line: 3, column: 5, desc: 'Session Title (The)' },
      { line: 3, column: 1, desc: 'Seq Marker (1)' },
      { line: 5, column: 9, desc: 'Paragraph (know)' },
      { line: 71, column: 17, desc: 'Verbatim Label (python)' },
      { line: 64, column: 20, desc: 'Verbatim Content (parse)' },
    ];

    for (const click of clicks) {
      console.log(`\n--- Clicking: ${click.desc} ---`);

      // Simulate click in Monaco Editor
      // We use executeJavaScript to access the Monaco editor instance directly
      await page.evaluate(({ line, column }) => {
        const debugWindow = window as DebugWindow;
        const editor = debugWindow.editor;
        if (!editor) {
          console.warn('Editor instance not available');
          return;
        }
        const position: Position = { lineNumber: line, column };
        editor.setPosition(position);
        editor.revealPosition(position);

        // Trigger the mouse down handler we added
        // We need to simulate the event object structure expected by our handler
        const model =
          typeof editor.getModel === 'function' ? editor.getModel() : null;
        if (!model) {
          console.warn('Editor model not ready');
          return;
        }
        const word = model.getWordAtPosition(position);
        const offset = model.getOffsetAt(position);

        console.log('--- Click Debug (Simulated) ---');
        console.log('Position:', position);
        console.log('Word:', word?.word ?? null);
        console.log('Offset:', offset);

        const tokens = debugWindow.monaco?.editor.tokenize(
          model.getValue(),
          model.getLanguageId()
        );
        if (Array.isArray(tokens) && tokens[position.lineNumber - 1]) {
          const lineTokens = tokens[position.lineNumber - 1] as TokenInfo[];
          const token = lineTokens.reduce<TokenInfo | null>(
            (result, current) => {
              if (current.offset <= position.column - 1) {
                return current;
              }
              return result;
            },
            null
          );

          console.log(
            'Monarch Token (Line):',
            token ? JSON.stringify(token) : 'null'
          );
          console.log('All Line Tokens:', JSON.stringify(lineTokens));
        }
      }, click);

      // Wait a bit to capture logs
      await page.waitForTimeout(500);
    }

    await app.close();
  });
});
