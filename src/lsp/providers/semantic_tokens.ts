import * as monaco from 'monaco-editor';
import { ProtocolConnection } from 'vscode-languageserver-protocol/browser';
import { LspSemanticTokens } from '../types';

export function registerSemanticTokensProvider(languageId: string, connection: ProtocolConnection) {
    monaco.languages.registerDocumentSemanticTokensProvider(languageId, {
        getLegend: () => ({
            tokenTypes: [
                'DocumentTitle', 'SessionMarker', 'SessionTitleText', 'DefinitionSubject', 'DefinitionContent',
                'ListMarker', 'ListItemText', 'AnnotationLabel', 'AnnotationParameter', 'AnnotationContent',
                'InlineStrong', 'InlineEmphasis', 'InlineCode', 'InlineMath', 'Reference', 'ReferenceCitation',
                'ReferenceFootnote', 'VerbatimSubject', 'VerbatimLanguage', 'VerbatimAttribute', 'VerbatimContent',
                'InlineMarker_strong_start', 'InlineMarker_strong_end', 'InlineMarker_emphasis_start', 'InlineMarker_emphasis_end',
                'InlineMarker_code_start', 'InlineMarker_code_end', 'InlineMarker_math_start', 'InlineMarker_math_end',
                'InlineMarker_ref_start', 'InlineMarker_ref_end',
                // Standard types
                'comment', 'string', 'keyword', 'number', 'regexp', 'operator', 'namespace',
                'type', 'struct', 'class', 'interface', 'enum', 'typeParameter', 'function',
                'method', 'decorator', 'macro', 'variable', 'parameter', 'property', 'label'
            ],
            tokenModifiers: ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification', 'documentation', 'defaultLibrary']
        }),
        provideDocumentSemanticTokens: async (model) => {
            console.log('[SemanticTokens] Provider triggered');
            if (!connection) return null;
            const params = {
                textDocument: { uri: model.uri.toString() }
            };
            try {
                const result = await connection.sendRequest('textDocument/semanticTokens/full', params) as LspSemanticTokens | null;
                if (!result || !result.data) return null;
                console.log(`[SemanticTokens] Received tokens: ${result.data.length}`);
                return {
                    data: new Uint32Array(result.data)
                };
            } catch (e) {
                console.error('[LSP] Semantic Tokens failed:', e);
                return null;
            }
        },
        releaseDocumentSemanticTokens: () => {}
    });
}
