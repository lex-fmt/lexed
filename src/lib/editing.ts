
export interface SnippetInsertionPayload {
    text: string;
    cursorOffset: number;
}

export function isSnippetInsertionPayload(value: unknown): value is SnippetInsertionPayload {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { text?: unknown }).text === 'string' &&
        typeof (value as { cursorOffset?: unknown }).cursorOffset === 'number'
    );
}

export interface InsertSnippetResult {
    textToInsert: string;
    prefix: string;
    suffix: string;
    newCursorOffset: number;
}

export function calculateSnippetInsertion(
    payload: SnippetInsertionPayload,
    currentLineNumber: number,
    currentColumn: number,
    currentOffset: number
): InsertSnippetResult {
    const prefix = currentLineNumber === 1 && currentColumn === 1 ? '' : '\n';
    const suffix = '\n';
    const textToInsert = `${prefix}${payload.text}${suffix}`;
    const newCursorOffset = currentOffset + prefix.length + payload.cursorOffset;

    return {
        textToInsert,
        prefix,
        suffix,
        newCursorOffset,
    };
}
