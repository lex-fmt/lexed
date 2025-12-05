import { Command, EditorAdapter } from '../types.js';

export interface InsertVerbatimArgs {
    content: string;
    language: string;
}

export const InsertVerbatimCommand: Command<InsertVerbatimArgs> = {
    id: 'lex.insertVerbatim',
    execute: async (editor: EditorAdapter, args: InsertVerbatimArgs) => {
        const text = `:: ${args.language}\n${args.content}\n`;
        await editor.insertText(text);
    }
};
