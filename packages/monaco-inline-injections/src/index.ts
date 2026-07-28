/**
 * Public API for `@lex/monaco-inline-injections`.
 *
 * Reusable bits for any Monaco-based editor that wants to inline-highlight
 * embedded code blocks (Markdown, AsciiDoc, Org-mode, Quarto, literate
 * programming, etc.). The package is host-neutral: the only Monaco-specific
 * adapter is `createMonacoInjectionHighlighter`.
 */

export {
  createMonacoInjectionHighlighter,
  type HighlighterOptions,
  type MonacoInjectionHighlighterApi
} from './monaco/injection_highlighter'

export type {
  DecorationCategory,
  InjectionHostAdapter,
  InjectionRange,
  InjectionZone,
  InjectionZoneProvider,
  SemanticTokens
} from './core/types'

export {
  CATEGORY_COLORS,
  CATEGORY_STYLES,
  DEBOUNCE_MS,
  LANGUAGE_ALIASES,
  SEMANTIC_TOKEN_MAP,
  VIRTUAL_DOC_SCHEME
} from './core/constants'

export { resolveLanguageId } from './core/resolve'
export { mapTokensToDecorations } from './core/mapTokens'
export { computeInjectionDecorations } from './core/compute'
