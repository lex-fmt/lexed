/**
 * Import/Export functionality via LSP.
 * All conversions go through the lex.export and lex.import LSP commands.
 */
import { lspClient } from '../lsp/client';

export type ExportFormat = 'markdown' | 'html' | 'pdf';
export type ImportFormat = 'markdown';

/**
 * Export content to a different format via LSP.
 * For text formats (markdown, html), returns the converted content.
 * For binary formats (pdf), writes to outputPath and returns the path.
 */
export async function exportContent(
    content: string,
    format: ExportFormat,
    sourceUri?: string,
    outputPath?: string
): Promise<string> {
    const args = outputPath
        ? [format, content, sourceUri ?? '', outputPath]
        : [format, content, sourceUri ?? ''];

    const result = await lspClient.sendRequest<string>('workspace/executeCommand', {
        command: 'lex.export',
        arguments: args
    });

    if (typeof result !== 'string') {
        throw new Error('Export failed: unexpected response from language server.');
    }

    return result;
}

/**
 * Import content from another format to Lex via LSP.
 */
export async function importContent(
    content: string,
    format: ImportFormat
): Promise<string> {
    const result = await lspClient.sendRequest<string>('workspace/executeCommand', {
        command: 'lex.import',
        arguments: [format, content]
    });

    if (typeof result !== 'string') {
        throw new Error('Import failed: unexpected response from language server.');
    }

    return result;
}

/**
 * Convert Lex content to HTML for preview.
 */
export async function convertToHtml(content: string): Promise<string> {
    return exportContent(content, 'html');
}
