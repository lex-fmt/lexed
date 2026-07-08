import * as monaco from 'monaco-editor'
import { ProtocolConnection } from 'vscode-languageserver-protocol/browser'
import { LspRange } from '../types'

interface LspDocumentLink {
  range: LspRange
  target?: string
  tooltip?: string
}

export function registerDocumentLinksProvider(
  languageId: string,
  connection: ProtocolConnection
): monaco.IDisposable {
  return monaco.languages.registerLinkProvider(languageId, {
    provideLinks: async (model) => {
      if (!connection) return { links: [] }
      const params = {
        textDocument: { uri: model.uri.toString() }
      }
      try {
        const result = (await connection.sendRequest('textDocument/documentLink', params)) as
          | LspDocumentLink[]
          | null
        if (!result) return { links: [] }
        return {
          links: result.map((link) => ({
            range: {
              startLineNumber: link.range.start.line + 1,
              startColumn: link.range.start.character + 1,
              endLineNumber: link.range.end.line + 1,
              endColumn: link.range.end.character + 1
            },
            url: link.target,
            tooltip: link.tooltip
          }))
        }
      } catch (e) {
        console.error('[LSP] Document links failed:', e)
        return { links: [] }
      }
    }
  })
}
