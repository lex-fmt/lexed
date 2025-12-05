import * as monaco from 'monaco-editor';
import { ProtocolConnection } from 'vscode-languageserver-protocol/browser';
import { LspCompletionItem, LspCompletionResponse } from '../types';

export function registerCompletionProvider(languageId: string, connection: ProtocolConnection) {
    monaco.languages.registerCompletionItemProvider(languageId, {
        triggerCharacters: ['@', '[', ':', '='],
        provideCompletionItems: async (model, position, context) => {
            if (!connection) return { suggestions: [] };

            const params = {
                textDocument: { uri: model.uri.toString() },
                position: { line: position.lineNumber - 1, character: position.column - 1 },
                context: {
                    triggerKind: context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter ? 2 : 1,
                    triggerCharacter: context.triggerCharacter
                }
            };

            try {
                const result = await connection.sendRequest('textDocument/completion', params) as LspCompletionResponse | null;
                if (!result) return { suggestions: [] };
                const items: LspCompletionItem[] = Array.isArray(result) ? result : result.items;
                // Default range: replace word at cursor
                const word = model.getWordUntilPosition(position);
                const defaultRange: monaco.IRange = {
                    startLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endLineNumber: position.lineNumber,
                    endColumn: word.endColumn
                };
                return {
                    suggestions: items.map((item) => ({
                        label: item.label,
                        kind: item.kind ? item.kind - 1 : monaco.languages.CompletionItemKind.Text,
                        insertText: item.insertText || item.label,
                        insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
                        documentation: item.documentation,
                        detail: item.detail,
                        range: item.textEdit ? {
                            startLineNumber: item.textEdit.range.start.line + 1,
                            startColumn: item.textEdit.range.start.character + 1,
                            endLineNumber: item.textEdit.range.end.line + 1,
                            endColumn: item.textEdit.range.end.character + 1
                        } : defaultRange
                    }))
                };
            } catch (e) {
                console.error('[LSP] Completion failed:', e);
                return { suggestions: [] };
            }
        }
    });
}
