/**
 * Host bindings — values the LSP layer pulls from the embedding app
 * (lexed today, lex-web tomorrow). The host calls `configureHost` once
 * during startup. All getters are optional; the package falls back to
 * sensible defaults when a binding is missing.
 */

export interface FormatterSettings {
  sessionBlankLinesBefore: number
  sessionBlankLinesAfter: number
  normalizeSeqMarkers: boolean
  unorderedSeqMarker: string
  maxBlankLines: number
  indentString: string
  preserveTrailingBlanks: boolean
  normalizeVerbatimMarkers: boolean
}

export interface Logger {
  debug(message: unknown, ...args: unknown[]): void
  info(message: unknown, ...args: unknown[]): void
  warn(message: unknown, ...args: unknown[]): void
  error(message: unknown, ...args: unknown[]): void
}

export interface E2EBridge {
  signal?: (name: string, payload?: unknown) => void
  notifyFormattingRequest?: (payload: { type: 'document' | 'range'; params: unknown }) => void
}

export interface HostBindings {
  /**
   * Returns the current workspace root. Used to resolve relative path
   * completions when the document URI alone is insufficient.
   */
  getWorkspaceRoot?: () => string | undefined
  /**
   * Returns the current formatter settings. Populates the `options`
   * field of `textDocument/formatting` requests.
   */
  getFormatterSettings?: () => FormatterSettings
  /**
   * Logger — defaults to console. Hosts that ship structured logging
   * (e.g. electron-log in lexed) should wire it here.
   */
  logger?: Logger
  /**
   * Optional e2e test bridge. When present, the package emits
   * lifecycle and request signals that Playwright tests synchronize on.
   */
  e2e?: E2EBridge
  /**
   * Called once when the package creates a Lex-language Monaco model
   * (after the LSP `didOpen` notification). Hosts use this to spin up
   * any model-attached subsystems they own (e.g. spellcheck).
   */
  onLexModelReady?: (model: import('monaco-editor').editor.ITextModel) => void
  /**
   * Called on every debounced content change of a Lex-language model
   * (same cadence as the `didChange` LSP notification). Hosts use this
   * to keep model-attached subsystems in sync.
   */
  onLexModelChange?: (model: import('monaco-editor').editor.ITextModel) => void
}

const DEFAULT_FORMATTER_SETTINGS: FormatterSettings = {
  sessionBlankLinesBefore: 1,
  sessionBlankLinesAfter: 1,
  normalizeSeqMarkers: true,
  unorderedSeqMarker: '-',
  maxBlankLines: 2,
  indentString: '    ',
  preserveTrailingBlanks: false,
  normalizeVerbatimMarkers: true,
}

let host: HostBindings = {}

export function configureHost(bindings: HostBindings): void {
  host = { ...host, ...bindings }
}

export function getWorkspaceRoot(): string | undefined {
  return host.getWorkspaceRoot?.()
}

export function getFormatterSettings(): FormatterSettings {
  return host.getFormatterSettings?.() ?? DEFAULT_FORMATTER_SETTINGS
}

export function getE2EBridge(): E2EBridge | undefined {
  return host.e2e
}

export function notifyLexModelReady(model: import('monaco-editor').editor.ITextModel): void {
  host.onLexModelReady?.(model)
}

export function notifyLexModelChange(model: import('monaco-editor').editor.ITextModel): void {
  host.onLexModelChange?.(model)
}

const consoleLogger: Logger = {
  debug: (...args) => console.debug(...args),
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
}

/**
 * Module-level proxy that looks up the configured logger lazily so
 * `configureHost` can replace it after this module has been imported.
 */
export const log: Logger = {
  debug: (...args) => (host.logger ?? consoleLogger).debug(...args),
  info: (...args) => (host.logger ?? consoleLogger).info(...args),
  warn: (...args) => (host.logger ?? consoleLogger).warn(...args),
  error: (...args) => (host.logger ?? consoleLogger).error(...args),
}
