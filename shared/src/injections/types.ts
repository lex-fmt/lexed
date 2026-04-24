/**
 * Host-neutral types for the injection highlighter.
 *
 * The shared injection module maps semantic-token output (from whatever host
 * syntax provider is available) onto the Lex document's verbatim zones. It
 * avoids any direct dependency on vscode, monaco, or web-tree-sitter so that
 * both `lex-vscode` and `lexed` can reuse the logic.
 */

export type DecorationCategory =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'type'
  | 'function'
  | 'operator';

/**
 * Zero-based range in the real Lex document.
 */
export interface InjectionRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

/**
 * A verbatim zone in the Lex document that has an annotated language.
 *
 * This matches the shape produced by `LexTreeSitter.queryInjections` — the
 * type is lifted into `@lex/shared` so host adapters can pass zones in
 * without importing vscode-specific modules.
 */
export interface InjectionZone {
  language: string;
  text: string;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

/**
 * Minimal semantic-tokens payload: just the ordered `tokenTypes` legend and
 * the raw deltas array as produced by VS Code's
 * `vscode.provideDocumentSemanticTokens` command (or its equivalent).
 */
export interface SemanticTokens {
  legend: { tokenTypes: readonly string[] };
  data: Uint32Array;
}

/**
 * Contract implemented by each editor host. The shared module only needs two
 * operations:
 *
 * 1. `getRegisteredLanguages` — resolve which language IDs the host actually
 *    knows how to tokenize. Hosts are expected to cache this themselves (the
 *    vscode adapter caches for 30s; lexed will cache similarly).
 * 2. `getSemanticTokens` — for a given zone's content and resolved language
 *    id, ask the host for semantic tokens. Returning `null` signals that no
 *    provider responded — the zone is skipped silently.
 */
export interface InjectionHostAdapter {
  getRegisteredLanguages(): Promise<Set<string>>;
  getSemanticTokens(
    zoneIndex: number,
    content: string,
    langId: string,
  ): Promise<SemanticTokens | null>;
}
