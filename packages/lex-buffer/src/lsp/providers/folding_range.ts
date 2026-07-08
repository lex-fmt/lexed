import * as monaco from 'monaco-editor'
import { ProtocolConnection } from 'vscode-languageserver-protocol/browser'

interface LspFoldingRange {
  startLine: number
  startCharacter?: number
  endLine: number
  endCharacter?: number
  kind?: 'comment' | 'imports' | 'region'
  collapsedText?: string
}

function mapKind(kind?: string): monaco.languages.FoldingRangeKind | undefined {
  switch (kind) {
    case 'comment':
      return monaco.languages.FoldingRangeKind.Comment
    case 'imports':
      return monaco.languages.FoldingRangeKind.Imports
    case 'region':
      return monaco.languages.FoldingRangeKind.Region
    default:
      return undefined
  }
}

export function registerFoldingRangeProvider(
  languageId: string,
  connection: ProtocolConnection
): monaco.IDisposable {
  return monaco.languages.registerFoldingRangeProvider(languageId, {
    provideFoldingRanges: async (model) => {
      if (!connection) return null
      const params = {
        textDocument: { uri: model.uri.toString() }
      }
      try {
        const result = (await connection.sendRequest('textDocument/foldingRange', params)) as
          | LspFoldingRange[]
          | null
        if (!result) return null
        // LSP folding ranges are 0-indexed; Monaco wants 1-indexed lines.
        return result.map((range) => ({
          start: range.startLine + 1,
          end: range.endLine + 1,
          kind: mapKind(range.kind)
        }))
      } catch (e) {
        console.error('[LSP] Folding range failed:', e)
        return null
      }
    }
  })
}
