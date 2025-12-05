import * as monaco from 'monaco-editor';
import { ProtocolConnection, CodeActionParams, CodeActionRequest, CodeAction as LspCodeAction, Command, TextEdit, Diagnostic } from 'vscode-languageserver-protocol/browser';

export function registerCodeActionProvider(languageId: string, connection: ProtocolConnection) {
    monaco.languages.registerCodeActionProvider(languageId, {
        provideCodeActions: async (
            model: monaco.editor.ITextModel,
            range: monaco.Range,
            context: monaco.languages.CodeActionContext
        ) => {
            if (!connection) return { actions: [], dispose: () => {} };

            const params: CodeActionParams = {
                textDocument: { uri: model.uri.toString() },
                range: {
                    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
                    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
                },
                context: {
                    diagnostics: context.markers.map((marker: monaco.editor.IMarkerData) => ({
                        range: {
                            start: { line: marker.startLineNumber - 1, character: marker.startColumn - 1 },
                            end: { line: marker.endLineNumber - 1, character: marker.endColumn - 1 }
                        },
                        message: marker.message,
                        severity: marker.severity === monaco.MarkerSeverity.Error ? 1 :
                                  marker.severity === monaco.MarkerSeverity.Warning ? 2 :
                                  marker.severity === monaco.MarkerSeverity.Info ? 3 : 4,
                        code: typeof marker.code === 'string' ? marker.code : undefined,
                        source: marker.source
                    }))
                }
            };

            try {
                const result = await connection.sendRequest(CodeActionRequest.type, params);
                if (!result) return { actions: [], dispose: () => {} };

                const actions: monaco.languages.CodeAction[] = [];
                
                for (const item of result) {
                    if (Command.is(item)) {
                        actions.push({
                            title: item.title,
                            command: {
                                id: item.command,
                                title: item.title,
                                arguments: item.arguments
                            },
                            kind: 'quickfix'
                        });
                    } else {
                        const action = item as LspCodeAction;
                        const monacoAction: monaco.languages.CodeAction = {
                            title: action.title,
                            kind: action.kind,
                            diagnostics: action.diagnostics ? action.diagnostics.map((d: Diagnostic) => ({
                                startLineNumber: d.range.start.line + 1,
                                startColumn: d.range.start.character + 1,
                                endLineNumber: d.range.end.line + 1,
                                endColumn: d.range.end.character + 1,
                                message: d.message,
                                severity: monaco.MarkerSeverity.Error
                            })) : undefined,
                            isPreferred: action.isPreferred,
                            disabled: action.disabled ? action.disabled.reason : undefined
                        };

                        if (action.edit) {
                            monacoAction.edit = {
                                edits: []
                            };
                            if (action.edit.changes) {
                                for (const [uri, edits] of Object.entries(action.edit.changes)) {
                                    const resource = monaco.Uri.parse(uri);
                                    for (const edit of (edits as TextEdit[])) {
                                        monacoAction.edit.edits.push({
                                            resource: resource,
                                            textEdit: {
                                                range: {
                                                    startLineNumber: edit.range.start.line + 1,
                                                    startColumn: edit.range.start.character + 1,
                                                    endLineNumber: edit.range.end.line + 1,
                                                    endColumn: edit.range.end.character + 1
                                                },
                                                text: edit.newText
                                            },
                                            versionId: undefined
                                        });
                                    }
                                }
                            }
                        }

                        if (action.command) {
                            monacoAction.command = {
                                id: action.command.command,
                                title: action.command.title,
                                arguments: action.command.arguments
                            };
                        }

                        actions.push(monacoAction);
                    }
                }

                return {
                    actions: actions,
                    dispose: () => {}
                };
            } catch (e) {
                console.error('[LSP] CodeAction failed:', e);
                return { actions: [], dispose: () => {} };
            }
        }
    });
}
