export const InsertVerbatimCommand = {
    id: 'lex.insertVerbatim',
    execute: async (editor, args) => {
        const text = `:: ${args.language}\n${args.content}\n`;
        await editor.insertText(text);
    }
};
