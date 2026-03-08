import * as monaco from 'monaco-editor'
import { lspClient } from '@/lsp/client'
import { getLanguageForFile, isLexFile } from '@/lib/files'

const modelCache = new Map<string, monaco.editor.ITextModel>()
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

const DEBOUNCE_DELAY_MS = 100

export function getOrCreateModel(path: string, content: string): monaco.editor.ITextModel {
  const cached = modelCache.get(path)
  if (cached && !cached.isDisposed()) {
    return cached
  }

  const uri = monaco.Uri.file(path)
  let model = monaco.editor.getModel(uri)
  if (model) {
    modelCache.set(path, model)
    return model
  }

  const language = getLanguageForFile(path)
  model = monaco.editor.createModel(content, language, uri)
  modelCache.set(path, model)

  if (language === 'lex') {
    lspClient.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: uri.toString(),
        languageId: 'lex',
        version: 1,
        text: content,
      },
    })

    const uriString = uri.toString()
    model.onDidChangeContent(() => {
      // Debounce didChange notifications to prevent race conditions
      // when the user types rapidly. Without debouncing, multiple notifications
      // can be processed out of order by the LSP.
      const existingTimer = debounceTimers.get(uriString)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      const timer = setTimeout(() => {
        debounceTimers.delete(uriString)
        if (model && !model.isDisposed()) {
          lspClient.sendNotification('textDocument/didChange', {
            textDocument: {
              uri: uriString,
              version: model.getVersionId(),
            },
            contentChanges: [{ text: model.getValue() }],
          })
        }
      }, DEBOUNCE_DELAY_MS)

      debounceTimers.set(uriString, timer)
    })
  }

  return model
}

export function disposeModel(path: string) {
  const model = modelCache.get(path)
  if (!model || model.isDisposed()) {
    modelCache.delete(path)
    return
  }

  const uriString = model.uri.toString()

  // Clear any pending debounced notification
  const timer = debounceTimers.get(uriString)
  if (timer) {
    clearTimeout(timer)
    debounceTimers.delete(uriString)
  }

  if (isLexFile(path)) {
    lspClient.sendNotification('textDocument/didClose', {
      textDocument: { uri: uriString },
    })
  }

  model.dispose()
  modelCache.delete(path)
}
