import type { DecorationCategory } from './types'

/**
 * Debounce window between document edits and the next highlight refresh.
 */
export const DEBOUNCE_MS = 250

/**
 * URI scheme used for virtual documents that back semantic-token requests.
 * Hosts register a text-document content provider against this scheme.
 */
export const VIRTUAL_DOC_SCHEME = 'inline-injection-embedded'

/**
 * Common annotation aliases → host language IDs.
 * If the annotation text is already a registered language ID, it's used
 * directly (see `resolveLanguageId`).
 */
export const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  py: 'python',
  js: 'javascript',
  jsx: 'javascriptreact',
  ts: 'typescript',
  tsx: 'typescriptreact',
  rs: 'rust',
  rb: 'ruby',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  shell: 'shellscript',
  yml: 'yaml',
  'c++': 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  htm: 'html',
  golang: 'go',
}

/**
 * Standard semantic token types → decoration categories. Types not listed
 * here (variable, parameter, property, etc.) get no special coloring — they
 * inherit the editor's default foreground.
 */
export const SEMANTIC_TOKEN_MAP: Readonly<Record<string, DecorationCategory>> = {
  keyword: 'keyword',
  modifier: 'keyword',
  function: 'function',
  method: 'function',
  macro: 'function',
  decorator: 'function',
  string: 'string',
  regexp: 'string',
  number: 'number',
  comment: 'comment',
  type: 'type',
  class: 'type',
  enum: 'type',
  interface: 'type',
  struct: 'type',
  typeParameter: 'type',
  namespace: 'type',
  operator: 'operator',
}

/**
 * Theme color IDs per category. Hosts translate these into native decoration
 * types.
 */
export const CATEGORY_COLORS: Readonly<Record<DecorationCategory, string>> = {
  keyword: 'inline-injection.keyword',
  string: 'inline-injection.string',
  comment: 'inline-injection.comment',
  number: 'inline-injection.number',
  type: 'inline-injection.type',
  function: 'inline-injection.function',
  operator: 'inline-injection.operator',
}

/**
 * Font-style overrides per category. Missing entries default to the editor's
 * regular style.
 */
export const CATEGORY_STYLES: Readonly<Partial<Record<DecorationCategory, string>>> = {
  comment: 'italic',
  keyword: 'bold',
}
