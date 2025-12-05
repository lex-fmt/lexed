import * as monaco from 'monaco-editor';
import { lspClient } from '@/lsp/client';

let registered = false;

export function registerLexLanguage() {
  if (registered) return;
  registered = true;

  const languages = monaco.languages.getLanguages();
  const lexRegistered = languages.some(language => language.id === 'lex');
  if (!lexRegistered) {
    monaco.languages.register({ id: 'lex', extensions: ['.lex'] });
    monaco.languages.setLanguageConfiguration('lex', {
      comments: {
        lineComment: ':: note :: ',
        blockComment: [':: note ::\n  ', '\n::'],
      },
      wordPattern: /[-#]+|[^\s]+/,
    });
  }

  // Start the language client
  lspClient.start().catch(err => {
    console.error('[LexMonaco] Failed to start LSP client', err);
  });
}
