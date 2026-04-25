/**
 * Host-neutral types for the injection highlighter.
 *
 * The core module maps semantic-token output (from whatever host syntax
 * provider is available) onto a document's annotated zones. It avoids any
 * direct dependency on monaco, vscode, web-tree-sitter, or Lex so that the
 * package can be reused by any Monaco-based editor for languages with
 * embedded code blocks (Markdown, AsciiDoc, Org-mode, Quarto, literate
 * programming, etc.).
 */

export type DecorationCategory =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'type'
  | 'function'
  | 'operator'

/**
 * Zero-based range in the host document.
 */
export interface InjectionRange {
  startLine: number
  startCol: number
  endLine: number
  endCol: number
}

/**
 * A zone in the host document that has an annotated language.
 *
 * Produced by an `InjectionZoneProvider` and consumed by the orchestrator.
 * Coordinates are zero-based; `startCol` applies only to the first line of
 * the zone (subsequent lines start at column 0).
 */
export interface InjectionZone {
  language: string
  text: string
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

/**
 * Minimal semantic-tokens payload: the ordered `tokenTypes` legend and the
 * raw deltas array as produced by VS Code's
 * `vscode.provideDocumentSemanticTokens` command (or its equivalent).
 */
export interface SemanticTokens {
  legend: { tokenTypes: readonly string[] }
  data: Uint32Array
}

/**
 * Contract implemented by each editor host. The orchestrator only needs two
 * operations:
 *
 * 1. `getRegisteredLanguages` — resolve which language IDs the host actually
 *    knows how to tokenize. Hosts are expected to cache this themselves.
 * 2. `getSemanticTokens` — for a given zone's content and resolved language
 *    id, ask the host for semantic tokens. Returning `null` signals that no
 *    provider responded — the zone is skipped silently.
 */
export interface InjectionHostAdapter {
  getRegisteredLanguages(): Promise<Set<string>>
  getSemanticTokens(
    zoneIndex: number,
    content: string,
    langId: string
  ): Promise<SemanticTokens | null>
}

/**
 * Strategy interface — given a document's full text, return the annotated
 * zones to highlight. The Monaco adapter calls this on every (debounced)
 * content change.
 *
 * Implementations are expected to be cheap to call repeatedly. If the
 * underlying parser maintains state (e.g. a tree-sitter incremental parse),
 * cache it inside the provider.
 */
export interface InjectionZoneProvider {
  getZones(content: string): InjectionZone[]
}
