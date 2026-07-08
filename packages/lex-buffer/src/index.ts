// Public surface of @lex-fmt/lex-buffer.
//
// This package wraps Monaco with the Lex-format LSP wiring and exposes a
// host-agnostic Editor surface. Hosts (Electron app, browser app) supply
// the LSP transport factory, file content, and any host-specific UI
// (tabs, status bar, file system).
export {
  setLspTransportFactory,
  ensureLspInitialized,
  hasCustomTransport,
  notifyWorkspaceFoldersChanged,
  lspClient,
  navigateTableCell,
  formatTableAtCursor,
  buildFormattingOptions,
  formatPromptHeadline,
  describeSource,
  describeCapability,
  describeTransport,
  type LspTransport,
  type TransportFactory,
  type TrustRequestSource,
  type TrustRequestParams,
  type TrustResponse,
  type LspPosition,
  type LspRange,
  type LspTextEdit,
  type LspCompletionItem,
  type LspCompletionResponse,
  type LspFormattingEdit,
  type LexInsertResponse,
  type LspLocation,
  type LspMarkedString,
  type LspHoverContents,
  type LspHover,
  type LspSemanticTokens,
  type LspDiagnostic,
  type LspPublishDiagnosticsParams
} from './lsp'
export { initializeMonaco, applyTheme, type ThemeMode } from './monaco'
export { getOrCreateModel, disposeModel } from './monaco/models'
export {
  configureHost,
  type HostBindings,
  type FormatterSettings,
  type Logger,
  type E2EBridge
} from './host'
export { Editor, type EditorProps, type EditorHandle } from './Editor'
