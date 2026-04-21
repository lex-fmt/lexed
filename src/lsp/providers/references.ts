import * as monaco from 'monaco-editor'
import { ProtocolConnection } from 'vscode-languageserver-protocol/browser'
import { LspLocation } from '../types'

export function registerReferencesProvider(languageId: string, connection: ProtocolConnection) {
  monaco.languages.registerReferenceProvider(languageId, {
    provideReferences: async (model, position, context) => {
      if (!connection) return null
      const params = {
        textDocument: { uri: model.uri.toString() },
        position: { line: position.lineNumber - 1, character: position.column - 1 },
        context: { includeDeclaration: context.includeDeclaration ?? true },
      }
      try {
        const result = (await connection.sendRequest('textDocument/references', params)) as
          | LspLocation[]
          | null
        if (!result) return null
        return result.map((loc) => ({
          uri: monaco.Uri.parse(loc.uri),
          range: {
            startLineNumber: loc.range.start.line + 1,
            startColumn: loc.range.start.character + 1,
            endLineNumber: loc.range.end.line + 1,
            endColumn: loc.range.end.character + 1,
          },
        }))
      } catch (e) {
        console.error('[LSP] References failed:', e)
        return null
      }
    },
  })
}
