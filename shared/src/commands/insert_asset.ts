import { Command, EditorAdapter } from '../types.js';

export interface InsertAssetArgs {
    path: string;
}

export const InsertAssetCommand: Command<InsertAssetArgs> = {
    id: 'lex.insertAsset',
    execute: async (editor: EditorAdapter, args: InsertAssetArgs) => {
        const text = `:: doc.image\nsrc: ${args.path}\n`;
        await editor.insertText(text);
    }
};
