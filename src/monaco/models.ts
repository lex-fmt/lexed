import * as monaco from 'monaco-editor';
import { lspClient } from '@/lsp/client';
import { getLanguageForFile, isLexFile } from '@/lib/files';

const modelCache = new Map<string, monaco.editor.ITextModel>();

export function getOrCreateModel(path: string, content: string): monaco.editor.ITextModel {
  const cached = modelCache.get(path);
  if (cached && !cached.isDisposed()) {
    return cached;
  }

  const uri = monaco.Uri.file(path);
  let model = monaco.editor.getModel(uri);
  if (model) {
    modelCache.set(path, model);
    return model;
  }

  const language = getLanguageForFile(path);
  model = monaco.editor.createModel(content, language, uri);
  modelCache.set(path, model);

  if (language === 'lex') {
    lspClient.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: uri.toString(),
        languageId: 'lex',
        version: 1,
        text: content,
      },
    });

    model.onDidChangeContent(() => {
      lspClient.sendNotification('textDocument/didChange', {
        textDocument: {
          uri: uri.toString(),
          version: (model?.getVersionId?.() ?? 1),
        },
        contentChanges: [{ text: model!.getValue() }],
      });
    });
  }

  return model;
}

export function disposeModel(path: string) {
  const model = modelCache.get(path);
  if (!model || model.isDisposed()) {
    modelCache.delete(path);
    return;
  }

  if (isLexFile(path)) {
    lspClient.sendNotification('textDocument/didClose', {
      textDocument: { uri: model.uri.toString() },
    });
  }

  model.dispose();
  modelCache.delete(path);
}
