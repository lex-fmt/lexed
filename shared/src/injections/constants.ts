import type { DecorationCategory } from './types.js';

/**
 * Debounce window between document edits and the next highlight refresh.
 * Lifted verbatim from the original vscode implementation.
 */
export const DEBOUNCE_MS = 250;

/**
 * URI scheme used for virtual documents that back semantic-token requests.
 * Hosts register a text-document content provider against this scheme.
 */
export const VIRTUAL_DOC_SCHEME = 'lex-embedded';

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
};

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
};

/**
 * Theme color IDs per category. Hosts translate these into native decoration
 * types (`vscode.ThemeColor` / monaco theme token, etc.).
 */
export const CATEGORY_COLORS: Readonly<Record<DecorationCategory, string>> = {
  keyword: 'lex.injection.keyword',
  string: 'lex.injection.string',
  comment: 'lex.injection.comment',
  number: 'lex.injection.number',
  type: 'lex.injection.type',
  function: 'lex.injection.function',
  operator: 'lex.injection.operator',
};

/**
 * Font-style overrides per category. Missing entries default to the editor's
 * regular style.
 */
export const CATEGORY_STYLES: Readonly<Partial<Record<DecorationCategory, string>>> = {
  comment: 'italic',
  keyword: 'bold',
};
