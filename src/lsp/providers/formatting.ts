import * as monaco from 'monaco-editor';
import { ProtocolConnection } from 'vscode-languageserver-protocol/browser';
import { LspTextEdit } from '../types';
import { getFormatterSettingsSnapshot } from '@/settings/snapshot';
import type { FormatterSettings } from '@/settings/types';

type LexFormattingProperties = Record<string, number | boolean | string>;

const buildLexFormattingProperties = (settings: FormatterSettings): LexFormattingProperties => ({
    'lex.session_blank_lines_before': settings.sessionBlankLinesBefore,
    'lex.session_blank_lines_after': settings.sessionBlankLinesAfter,
    'lex.normalize_seq_markers': settings.normalizeSeqMarkers,
    'lex.unordered_seq_marker': settings.unorderedSeqMarker || '-',
    'lex.max_blank_lines': settings.maxBlankLines,
    'lex.indent_string': settings.indentString,
    'lex.preserve_trailing_blanks': settings.preserveTrailingBlanks,
    'lex.normalize_verbatim_markers': settings.normalizeVerbatimMarkers,
});

export const buildFormattingOptions = (tabSize: number, insertSpaces: boolean) => {
    const formatterSettings = getFormatterSettingsSnapshot();
    return {
        tabSize,
        insertSpaces,
        ...buildLexFormattingProperties(formatterSettings),
    };
};

export const notifyLexTest = (payload: { type: 'document' | 'range'; params: unknown }) => {
    if (typeof window === 'undefined') return;
    const scopedWindow = window as typeof window & {
        lexTest?: {
            notifyFormattingRequest?: (info: { type: 'document' | 'range'; params: unknown }) => void;
        };
        __lexLastFormattingRequest?: { type: 'document' | 'range'; params: unknown } | null;
    };
    scopedWindow.__lexLastFormattingRequest = payload;
    scopedWindow.lexTest?.notifyFormattingRequest?.(payload);
};

export function registerFormattingProvider(languageId: string, connection: ProtocolConnection) {
    // Formatting
    monaco.languages.registerDocumentFormattingEditProvider(languageId, {
        provideDocumentFormattingEdits: async (model, options) => {
            if (!connection) return [];
            const params = {
                textDocument: { uri: model.uri.toString() },
                options: buildFormattingOptions(options.tabSize, options.insertSpaces)
            };
            notifyLexTest({ type: 'document', params });
            try {
                const result = await connection.sendRequest('textDocument/formatting', params) as LspTextEdit[] | null;
                if (!result) return [];
                return result.map(edit => ({
                    range: {
                        startLineNumber: edit.range.start.line + 1,
                        startColumn: edit.range.start.character + 1,
                        endLineNumber: edit.range.end.line + 1,
                        endColumn: edit.range.end.character + 1
                    },
                    text: edit.newText
                }));
            } catch (e) {
                console.error('[LSP] Formatting failed:', e);
                return [];
            }
        }
    });

    // Range Formatting
    monaco.languages.registerDocumentRangeFormattingEditProvider(languageId, {
        provideDocumentRangeFormattingEdits: async (model, range, options) => {
            if (!connection) return [];
            const params = {
                textDocument: { uri: model.uri.toString() },
                range: {
                    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
                    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
                },
                options: buildFormattingOptions(options.tabSize, options.insertSpaces)
            };
            notifyLexTest({ type: 'range', params });
            try {
                const result = await connection.sendRequest('textDocument/rangeFormatting', params) as LspTextEdit[] | null;
                if (!result) return [];
                return result.map(edit => ({
                    range: {
                        startLineNumber: edit.range.start.line + 1,
                        startColumn: edit.range.start.character + 1,
                        endLineNumber: edit.range.end.line + 1,
                        endColumn: edit.range.end.character + 1
                    },
                    text: edit.newText
                }));
            } catch (e) {
                console.error('[LSP] Range Formatting failed:', e);
                return [];
            }
        }
    });
}
