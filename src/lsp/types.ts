export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspTextEdit {
  range: LspRange;
  newText: string;
}

export interface LspCompletionItem {
  label: string;
  kind?: number;
  insertText?: string;
  insertTextFormat?: number;
  detail?: string;
  documentation?: string | { value: string };
  textEdit?: LspTextEdit & { newText?: string };
}

export type LspCompletionResponse =
  | LspCompletionItem[]
  | { items: LspCompletionItem[] };

export interface LspFormattingEdit {
  range: LspRange;
  newText: string;
}

export interface LexInsertResponse {
  text: string;
  cursorOffset: number;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface LspMarkedString {
  language?: string;
  value: string;
}

export type LspHoverContents = string | LspMarkedString | (string | LspMarkedString)[];

export interface LspHover {
  contents: LspHoverContents;
  range?: LspRange;
}

export interface LspSemanticTokens {
  data: number[];
}

export interface LspDiagnostic {
  range: LspRange;
  message: string;
  severity?: number;
  code?: string | number;
  source?: string;
}

export interface LspPublishDiagnosticsParams {
  uri: string;
  diagnostics: LspDiagnostic[];
}
