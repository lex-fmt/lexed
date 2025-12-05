import * as monaco from 'monaco-editor';
import { EditorAdapter } from '@lex/shared';

export class MonacoEditorAdapter implements EditorAdapter {
    constructor(private editor: monaco.editor.IStandaloneCodeEditor) {}

    async insertText(text: string): Promise<void> {
        const selection = this.editor.getSelection();
        if (!selection) return;

        const op = {
            range: selection,
            text: text,
            forceMoveMarkers: true
        };
        this.editor.executeEdits('lex-adapter', [op]);
    }
}
