import { useState, useEffect, useMemo, useCallback } from 'react';
import { Uri } from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import { lspClient } from '../lsp/client';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown, BookOpen, List, Type, Braces, AtSign, FileText, Code, Circle } from 'lucide-react';

interface DocumentSymbol {
    name: string;
    kind: number;
    range: Range;
    selectionRange: Range;
    children?: DocumentSymbol[];
}

interface Range {
    start: { line: number; character: number };
    end: { line: number; character: number };
}

interface OutlineProps {
    currentFile: string | null;
    editor?: Monaco.editor.IStandaloneCodeEditor | null;
    cursorLine?: number;
}

// LSP SymbolKind constants (from LSP spec)
const SymbolKind = {
    NAMESPACE: 3,    // Session
    FIELD: 8,        // ?
    STRING: 15,      // Paragraph
    ARRAY: 18,       // List
    OBJECT: 19,      // ListItem
    STRUCT: 23,      // Definition
    EVENT: 24,       // Annotation
} as const;

/** Get icon for LSP symbol kind */
function getSymbolIcon(kind: number, size: number = 14) {
    const iconClass = "shrink-0 text-muted-foreground";
    switch (kind) {
        case SymbolKind.NAMESPACE: // Session
            return <BookOpen size={size} className={iconClass} />;
        case SymbolKind.STRUCT: // Definition
            return <Braces size={size} className={iconClass} />;
        case SymbolKind.ARRAY: // List
            return <List size={size} className={iconClass} />;
        case SymbolKind.OBJECT: // ListItem
            return <Circle size={size} className={iconClass} />;
        case SymbolKind.STRING: // Paragraph
            return <Type size={size} className={iconClass} />;
        case SymbolKind.EVENT: // Annotation
            return <AtSign size={size} className={iconClass} />;
        case SymbolKind.FIELD: // VerbatimBlock
            return <Code size={size} className={iconClass} />;
        default:
            return <FileText size={size} className={iconClass} />;
    }
}

// Find the deepest symbol that contains the cursor line
function findActiveSymbol(symbols: DocumentSymbol[], line: number): DocumentSymbol | null {
    for (const symbol of symbols) {
        if (line >= symbol.range.start.line && line <= symbol.range.end.line) {
            // Check children for a more specific match
            if (symbol.children) {
                const childMatch = findActiveSymbol(symbol.children, line);
                if (childMatch) return childMatch;
            }
            return symbol;
        }
    }
    return null;
}

// Build a set of paths to expanded nodes (ancestors of active symbol)
function getExpandedPaths(symbols: DocumentSymbol[], activeSymbol: DocumentSymbol | null, basePath: string = ''): Set<string> {
    const paths = new Set<string>();

    function findPath(items: DocumentSymbol[], path: string): boolean {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const itemPath = `${path}/${i}`;

            if (item === activeSymbol) {
                // Add all ancestor paths
                let ancestorPath = path;
                while (ancestorPath) {
                    paths.add(ancestorPath);
                    ancestorPath = ancestorPath.substring(0, ancestorPath.lastIndexOf('/'));
                }
                return true;
            }

            if (item.children && findPath(item.children, itemPath)) {
                return true;
            }
        }
        return false;
    }

    findPath(symbols, basePath);
    return paths;
}

export function Outline({ currentFile, editor, cursorLine }: OutlineProps) {
    const [symbols, setSymbols] = useState<DocumentSymbol[]>([]);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!currentFile) {
            setSymbols([]);
            return;
        }

        const fetchSymbols = async () => {
            try {
                const uri = Uri.file(currentFile).toString();
                const response = await lspClient.sendRequest('textDocument/documentSymbol', {
                    textDocument: { uri }
                });

                if (Array.isArray(response)) {
                    setSymbols(response);
                } else {
                    setSymbols([]);
                }
            } catch (e) {
                console.error('Failed to fetch symbols', e);
                setSymbols([]);
            }
        };

        fetchSymbols();
        const interval = setInterval(fetchSymbols, 2000);
        return () => clearInterval(interval);

    }, [currentFile]);

    // Find active symbol based on cursor position
    const activeSymbol = useMemo(() => {
        if (cursorLine === undefined) return null;
        return findActiveSymbol(symbols, cursorLine);
    }, [symbols, cursorLine]);

    // Auto-expand paths to active symbol
    const autoExpandedPaths = useMemo(() => {
        return getExpandedPaths(symbols, activeSymbol);
    }, [symbols, activeSymbol]);

    const toggleCollapsed = useCallback((path: string) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    const handleSymbolClick = (symbol: DocumentSymbol) => {
        if (!editor) return;

        // Navigate to the symbol's selection range (more precise than range)
        const position = {
            lineNumber: symbol.selectionRange.start.line + 1, // Monaco uses 1-based lines
            column: symbol.selectionRange.start.character + 1
        };

        editor.setPosition(position);
        editor.revealPositionInCenter(position);
        editor.focus();
    };

    const renderSymbols = (items: DocumentSymbol[], depth = 0, basePath = '') => {
        return items.map((item, index) => {
            const isActive = activeSymbol === item;
            const hasChildren = item.children && item.children.length > 0;
            const path = `${basePath}/${index}`;
            // Item is expanded if it's not manually collapsed AND (it's auto-expanded OR has no children)
            const isExpanded = !collapsed.has(path) && (autoExpandedPaths.has(path) || !hasChildren || depth === 0);
            const isAncestorOfActive = autoExpandedPaths.has(path);
            const isHighlighted = isActive || isAncestorOfActive;

            return (
                <div key={path}>
                    <div
                        className={cn(
                            "flex items-center gap-1 cursor-pointer",
                            "hover:bg-panel-hover",
                            isHighlighted
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground"
                        )}
                        style={{
                            paddingLeft: `calc(var(--panel-item-padding) + ${depth * 12}px)`,
                            paddingRight: 'var(--panel-item-padding)',
                            paddingTop: '2px',
                            paddingBottom: '2px',
                        }}
                        title={item.name}
                        onClick={() => handleSymbolClick(item)}
                    >
                        {/* Collapse/Expand chevron */}
                        <span
                            className="w-4 flex items-center justify-center shrink-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (hasChildren) {
                                    toggleCollapsed(path);
                                }
                            }}
                        >
                            {hasChildren ? (
                                isExpanded ? (
                                    <ChevronDown size={14} className="text-muted-foreground" />
                                ) : (
                                    <ChevronRight size={14} className="text-muted-foreground" />
                                )
                            ) : null}
                        </span>
                        {/* Icon */}
                        {getSymbolIcon(item.kind)}
                        {/* Label */}
                        <span
                            className="truncate text-[12px]"
                        >
                            {item.name}
                        </span>
                    </div>
                    {hasChildren && isExpanded && (
                        <div>{renderSymbols(item.children!, depth + 1, path)}</div>
                    )}
                </div>
            );
        });
    };

    return (
        <div
            data-testid="outline-view"
            className="h-full overflow-y-auto text-foreground bg-panel"
            style={{ fontFamily: 'system-ui, sans-serif' }}
        >
            {symbols.length > 0 ? (
                <div style={{ paddingTop: 'var(--panel-item-padding)', paddingBottom: 'var(--panel-item-padding)' }}>
                    {renderSymbols(symbols)}
                </div>
            ) : (
                <div
                    className="text-sm text-muted-foreground"
                    style={{ padding: 'var(--panel-item-padding)' }}
                >
                    {currentFile ? 'No symbols found' : 'No file open'}
                </div>
            )}
        </div>
    );
}
