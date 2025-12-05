import * as monaco from 'monaco-editor';
import { lspClient } from '../lsp/client';
import { 
    isSnippetInsertionPayload, 
    calculateSnippetInsertion, 
    type SnippetInsertionPayload 
} from '@/lib/editing';

async function invokeInsertCommand(
    editor: monaco.editor.IStandaloneCodeEditor,
    command: string,
    args: unknown[]
): Promise<void> {
    const model = editor.getModel();
    if (!model) return;

    const position = editor.getPosition();
    if (!position) return;

    try {
        const response = await lspClient.sendRequest<SnippetInsertionPayload>('workspace/executeCommand', {
            command,
            arguments: [model.uri.toString(), { line: position.lineNumber - 1, character: position.column - 1 }, ...args]
        });

        if (response && isSnippetInsertionPayload(response)) {
            console.log('invokeInsertCommand: received snippet payload', response);
            insertSnippet(editor, position, response);
        } else {
            console.error('Invalid snippet payload received', response);
        }
    } catch (error) {
        console.error(`Failed to execute ${command}:`, error);
        throw error;
    }
}

function insertSnippet(
    editor: monaco.editor.IStandaloneCodeEditor,
    position: monaco.Position,
    payload: SnippetInsertionPayload
) {
    const model = editor.getModel();
    if (!model) return;

    const startOffset = model.getOffsetAt(position);
    
    const { textToInsert, newCursorOffset } = calculateSnippetInsertion(
        payload,
        position.lineNumber,
        position.column,
        startOffset
    );

    editor.executeEdits('lex-insert', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: textToInsert,
        forceMoveMarkers: true
    }]);

    const newPosition = model.getPositionAt(newCursorOffset);
    
    editor.setSelection(new monaco.Selection(
        newPosition.lineNumber, newPosition.column,
        newPosition.lineNumber, newPosition.column
    ));
    editor.revealPosition(newPosition);
}

export async function insertAsset(editor: monaco.editor.IStandaloneCodeEditor, assetPath: string) {
    console.log('insertAsset called with', assetPath);
    await invokeInsertCommand(editor, 'lex.insert_asset', [assetPath]);
}

export async function insertVerbatim(editor: monaco.editor.IStandaloneCodeEditor, filePath: string) {
    await invokeInsertCommand(editor, 'lex.insert_verbatim', [filePath]);
}

export async function resolveAnnotation(editor: monaco.editor.IStandaloneCodeEditor) {
    await invokeInsertCommand(editor, 'lex.resolve_annotation', []);
}

export async function toggleAnnotations(editor: monaco.editor.IStandaloneCodeEditor) {
    await invokeInsertCommand(editor, 'lex.toggle_annotations', []);
}
