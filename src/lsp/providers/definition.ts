import * as monaco from 'monaco-editor';
import { ProtocolConnection } from 'vscode-languageserver-protocol/browser';
import { LspLocation } from '../types';

export function registerDefinitionProvider(languageId: string, connection: ProtocolConnection) {
    monaco.languages.registerDefinitionProvider(languageId, {
        provideDefinition: async (model, position) => {
            if (!connection) return null;
            const params = {
                textDocument: { uri: model.uri.toString() },
                position: { line: position.lineNumber - 1, character: position.column - 1 }
            };
            try {
                const result = await connection.sendRequest('textDocument/definition', params) as LspLocation | LspLocation[] | null;
                if (!result) return null;
                const locations = Array.isArray(result) ? result : [result];
                return locations.map((loc) => ({
                    uri: monaco.Uri.parse(loc.uri),
                    range: {
                        startLineNumber: loc.range.start.line + 1,
                        startColumn: loc.range.start.character + 1,
                        endLineNumber: loc.range.end.line + 1,
                        endColumn: loc.range.end.character + 1
                    }
                }));
            } catch (e) {
                console.error('[LSP] Definition failed:', e);
                return null;
            }
        }
    });
}
