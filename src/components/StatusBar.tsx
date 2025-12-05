import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type * as Monaco from 'monaco-editor';

export interface ExportStatus {
    isExporting: boolean;
    format: string | null;
}

interface StatusBarProps {
    editor: Monaco.editor.IStandaloneCodeEditor | null;
    exportStatus?: ExportStatus;
    onVimStatusNodeChange?: (node: HTMLDivElement | null) => void;
}

interface CursorInfo {
    line: number;
    column: number;
    selected: number;
    selectedLines: number;
}

export function StatusBar({ editor, exportStatus, onVimStatusNodeChange }: StatusBarProps) {
    const [cursor, setCursor] = useState<CursorInfo>({ line: 1, column: 1, selected: 0, selectedLines: 0 });

    const handleVimStatusRef = useCallback((node: HTMLDivElement | null) => {
        onVimStatusNodeChange?.(node);
        if (!node) return;
        node.textContent = '';
    }, [onVimStatusNodeChange]);

    useEffect(() => {
        if (!editor) return;

        const updateCursor = () => {
            const position = editor.getPosition();
            const selection = editor.getSelection();
            const model = editor.getModel();

            if (position) {
                let selected = 0;
                let selectedLines = 0;

                if (selection && !selection.isEmpty() && model) {
                    selected = model.getValueInRange(selection).length;
                    selectedLines = selection.endLineNumber - selection.startLineNumber + 1;
                }

                setCursor({
                    line: position.lineNumber,
                    column: position.column,
                    selected,
                    selectedLines,
                });
            }
        };

        const disposables = [
            editor.onDidChangeCursorPosition(updateCursor),
            editor.onDidChangeCursorSelection(updateCursor),
        ];

        updateCursor();

        return () => {
            disposables.forEach(d => d.dispose());
        };
    }, [editor]);

    return (
        <div className="h-6 flex items-center px-3 bg-panel border-t border-border text-xs text-muted-foreground shrink-0 gap-4">
            <div
                ref={handleVimStatusRef}
                data-testid="vim-status"
                className="font-mono opacity-80 text-muted-foreground min-w-[96px]"
            />
            <span>
                Ln {cursor.line}, Col {cursor.column}
            </span>
            {cursor.selected > 0 && (
                <span>
                    ({cursor.selected} selected{cursor.selectedLines > 1 ? `, ${cursor.selectedLines} lines` : ''})
                </span>
            )}
            {exportStatus?.isExporting && (
                <span className="flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" />
                    Exporting to {exportStatus.format}
                </span>
            )}
            <span className="ml-auto">Lex</span>
        </div>
    );
}
