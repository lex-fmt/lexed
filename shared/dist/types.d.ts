export interface EditorAdapter {
    /**
     * Inserts text at the current cursor position.
     */
    insertText(text: string): Promise<void>;
}
export interface Command<TArgs = any> {
    id: string;
    execute(editor: EditorAdapter, args: TArgs): Promise<void>;
}
