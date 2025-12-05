
export interface Location {
    uri: string;
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

export function isLocation(value: unknown): value is Location {
    return (
        typeof value === 'object' &&
        value !== null &&
        'uri' in value &&
        typeof (value as { uri: unknown }).uri === 'string' &&
        'range' in value &&
        typeof (value as { range: unknown }).range === 'object' &&
        (value as { range: unknown }).range !== null
    );
}
