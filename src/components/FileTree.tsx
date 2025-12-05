/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ignore, { type Ignore } from 'ignore';
import { cn } from '@/lib/utils';
import { Folder, FolderOpen, FileText, FileCode, File, FileType, ChevronRight, ChevronDown } from 'lucide-react';
import { FILE_TREE_REFRESH_EVENT } from '@/lib/events';

interface FileEntry {
    name: string;
    isDirectory: boolean;
    path: string;
    children?: FileEntry[];
    isOpen?: boolean;
}

interface FileTreeProps {
    rootPath?: string;
    selectedFile?: string | null;
    onFileSelect: (path: string) => void;
}

/** File extensions that can be opened in the editor */
const OPENABLE_EXTENSIONS = ['.lex', '.txt', '.md', '.html'];

/** Check if a file can be opened in the editor */
function isOpenable(filename: string): boolean {
    const lower = filename.toLowerCase();
    return OPENABLE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/** Get the file extension */
function getExtension(filename: string): string {
    const idx = filename.lastIndexOf('.');
    return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

/** Get the appropriate icon for a file */
function getFileIcon(filename: string, size: number = 14) {
    const ext = getExtension(filename);
    switch (ext) {
        case '.lex':
            return <FileType size={size} className="shrink-0" />;
        case '.md':
            return <FileText size={size} className="shrink-0" />;
        case '.html':
        case '.htm':
            return <FileCode size={size} className="shrink-0" />;
        case '.txt':
            return <FileText size={size} className="shrink-0" />;
        default:
            return <File size={size} className="shrink-0" />;
    }
}

export function FileTree({ rootPath, selectedFile, onFileSelect }: FileTreeProps) {
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);
    const [gitignoreMatcher, setGitignoreMatcher] = useState<Ignore | null>(null);

    const normalizedSelectedFile = useMemo(() => {
        return selectedFile ? normalizePath(selectedFile) : null;
    }, [selectedFile]);

    const loadGitignore = useCallback(async () => {
        if (!rootPath) {
            setGitignoreMatcher(null);
            return;
        }
        try {
            const gitignorePath = rootPath.endsWith('/') || rootPath.endsWith('\\')
                ? `${rootPath}.gitignore`
                : `${rootPath}/.gitignore`;
            const content = await window.ipcRenderer.fileRead(gitignorePath);
            if (content) {
                const matcher = ignore();
                matcher.add(content.split(/\r?\n/));
                setGitignoreMatcher(matcher);
            } else {
                setGitignoreMatcher(null);
            }
        } catch {
            setGitignoreMatcher(null);
        }
    }, [rootPath]);

    useEffect(() => {
        void loadGitignore();
    }, [loadGitignore]);

    // Close context menu when clicking outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        if (contextMenu) {
            document.addEventListener('click', handleClick);
            return () => document.removeEventListener('click', handleClick);
        }
    }, [contextMenu]);

    const shouldIncludeEntry = useCallback((entryPath: string, isDirectory: boolean) => {
        if (!rootPath || !gitignoreMatcher) return true;
        const normalizedRoot = normalizePath(rootPath).replace(/\/+$/, '');
        const normalizedEntry = normalizePath(entryPath);
        if (!normalizedEntry.startsWith(normalizedRoot)) {
            return true;
        }
        let relative = normalizedEntry.slice(normalizedRoot.length);
        if (relative.startsWith('/')) {
            relative = relative.slice(1);
        }
        if (!relative) {
            return true;
        }
        const target = isDirectory ? `${relative}/` : relative;
        return !gitignoreMatcher.ignores(target);
    }, [rootPath, gitignoreMatcher]);

    const loadDir = useCallback(async (path: string): Promise<FileEntry[]> => {
        const entries = await window.ipcRenderer.fileReadDir(path);
        return entries
            .filter(entry => shouldIncludeEntry(entry.path, entry.isDirectory))
            .sort((a, b) => {
                if (a.isDirectory === b.isDirectory) {
                    return a.name.localeCompare(b.name);
                }
                return a.isDirectory ? -1 : 1;
            });
    }, [shouldIncludeEntry]);

    const refreshTree = useCallback(() => {
        if (rootPath) {
            loadDir(rootPath).then(setFiles);
        } else {
            setFiles([]);
        }
    }, [rootPath, loadDir]);

    useEffect(() => {
        refreshTree();
    }, [refreshTree]);

    useEffect(() => {
        const handleWindowFocus = () => refreshTree();
        const handleCustomRefresh = () => refreshTree();
        window.addEventListener('focus', handleWindowFocus);
        window.addEventListener('blur', handleWindowFocus);
        window.addEventListener(FILE_TREE_REFRESH_EVENT as any, handleCustomRefresh as EventListener);
        return () => {
            window.removeEventListener('focus', handleWindowFocus);
            window.removeEventListener('blur', handleWindowFocus);
            window.removeEventListener(FILE_TREE_REFRESH_EVENT as any, handleCustomRefresh as EventListener);
        };
    }, [refreshTree]);

    const toggleDir = async (entry: FileEntry) => {
        if (!entry.isDirectory) {
            // Only open if file is openable
            if (isOpenable(entry.name)) {
                onFileSelect(entry.path);
            }
            return;
        }

        if (entry.isOpen) {
            // Close
            const closeDir = (list: FileEntry[]): FileEntry[] => {
                return list.map(item => {
                    if (item.path === entry.path) {
                        return { ...item, isOpen: false };
                    }
                    if (item.children) {
                        return { ...item, children: closeDir(item.children) };
                    }
                    return item;
                });
            };
            setFiles(prev => closeDir(prev));
        } else {
            // Open
            const children = await loadDir(entry.path);
            const openDir = (list: FileEntry[]): FileEntry[] => {
                return list.map(item => {
                    if (item.path === entry.path) {
                        return { ...item, isOpen: true, children };
                    }
                    if (item.children) {
                        return { ...item, children: openDir(item.children) };
                    }
                    return item;
                });
            };
            setFiles(prev => openDir(prev));
        }
    };

    const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, path });
    }, []);

    const handleShowInFinder = useCallback(() => {
        if (contextMenu) {
            window.ipcRenderer.showItemInFolder(contextMenu.path);
            setContextMenu(null);
        }
    }, [contextMenu]);

    const renderTree = (entries: FileEntry[], depth = 0) => {
        return entries.map(entry => {
            const normalizedEntryPath = normalizePath(entry.path);
            const isSelected = !entry.isDirectory && entry.path === selectedFile;
            const isAncestorOfSelection = entry.isDirectory && normalizedSelectedFile
                ? normalizedSelectedFile.startsWith(`${normalizedEntryPath.replace(/\/+$/, '')}/`)
                : false;
            const isActive = isSelected || isAncestorOfSelection;
            const canOpen = entry.isDirectory || isOpenable(entry.name);

            return (
                <div key={entry.path}>
                    <div
                        className={cn(
                            "py-0.5 flex items-center text-[13px] gap-1",
                            "hover:bg-panel-hover",
                            isActive
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground",
                            canOpen ? "cursor-pointer" : "cursor-default opacity-50"
                        )}
                        data-testid="file-tree-item"
                        data-path={entry.path}
                        data-selected={isSelected}
                        style={{
                            paddingLeft: `calc(var(--panel-item-padding) + ${depth * 12}px)`,
                            paddingRight: 'var(--panel-item-padding)',
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleDir(entry);
                        }}
                        onContextMenu={(e) => handleContextMenu(e, entry.path)}
                    >
                        {entry.isDirectory ? (
                            <>
                                <span className="w-4 flex items-center justify-center shrink-0">
                                    {entry.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </span>
                                {entry.isOpen ? (
                                    <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
                                ) : (
                                    <Folder size={14} className="shrink-0 text-muted-foreground" />
                                )}
                            </>
                        ) : (
                            <>
                                <span className="w-4 shrink-0" />
                                {getFileIcon(entry.name)}
                            </>
                        )}
                        <span className="truncate">{entry.name}</span>
                    </div>
                    {entry.isOpen && entry.children && (
                        <div>{renderTree(entry.children, depth + 1)}</div>
                    )}
                </div>
            );
        });
    };

    // Platform-specific label for "Show in Finder"
    // Use navigator.platform to detect OS in browser context
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isWindows = navigator.platform.toUpperCase().indexOf('WIN') >= 0;
    const showInFolderLabel = isMac
        ? 'Reveal in Finder'
        : isWindows
            ? 'Show in Explorer'
            : 'Show in File Manager';

    return (
        <div className="h-full bg-panel overflow-y-auto text-foreground relative"
            data-testid="file-tree"
            style={{ fontFamily: 'system-ui, sans-serif' }}
        >
            <div
                className="text-xs font-semibold border-b border-border"
                style={{ padding: 'var(--panel-item-padding)' }}
            >
                Explorer
            </div>
            {files.length > 0 ? (
                <div style={{ paddingTop: 'var(--panel-item-padding)', paddingBottom: 'var(--panel-item-padding)' }}>
                    {renderTree(files)}
                </div>
            ) : (
                <div
                    className="text-[13px] text-muted-foreground"
                    style={{ padding: 'var(--panel-item-padding)' }}
                >
                    {rootPath ? 'Loading...' : 'No folder opened'}
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-panel border border-border rounded-md shadow-lg py-1 z-50 min-w-[160px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-panel-hover"
                        onClick={handleShowInFinder}
                    >
                        {showInFolderLabel}
                    </button>
                </div>
            )}
        </div>
    );
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, '/');
}
