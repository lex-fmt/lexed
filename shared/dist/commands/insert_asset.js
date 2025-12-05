export const InsertAssetCommand = {
    id: 'lex.insertAsset',
    execute: async (editor, args) => {
        const text = `:: doc.image\nsrc: ${args.path}\n`;
        await editor.insertText(text);
    }
};
