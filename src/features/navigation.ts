import * as monaco from 'monaco-editor';
import { lspClient } from '../lsp/client';
import { isLocation, type Location } from '@/lib/navigation';

export { type Location };

async function invokeNavigationCommand(
    editor: monaco.editor.IStandaloneCodeEditor,
    command: string
): Promise<Location | null> {
    const model = editor.getModel();
    if (!model) return null;

    const position = editor.getPosition();
    if (!position) return null;

    try {
        const response = await lspClient.sendRequest('workspace/executeCommand', {
            command,
            arguments: [model.uri.toString(), { line: position.lineNumber - 1, character: position.column - 1 }]
        });

        if (isLocation(response)) {
            return response;
        }
    } catch (error) {
        console.error(`Failed to execute ${command}:`, error);
    }
    return null;
}

export async function nextAnnotation(editor: monaco.editor.IStandaloneCodeEditor): Promise<Location | null> {
    return invokeNavigationCommand(editor, 'lex.next_annotation');
}

export async function previousAnnotation(editor: monaco.editor.IStandaloneCodeEditor): Promise<Location | null> {
    return invokeNavigationCommand(editor, 'lex.previous_annotation');
}
