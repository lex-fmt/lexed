import { forwardRef, useImperativeHandle, useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Editor, EditorHandle } from './Editor';
import { PreviewPane } from './PreviewPane';
import { TabBar, Tab, TabDropData } from './TabBar';
import { StatusBar, ExportStatus } from './StatusBar';
import type * as Monaco from 'monaco-editor';

/**
 * Auto-save interval in milliseconds.
 * Files are automatically saved every 5 minutes while the window has focus.
 */
const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface EditorPaneHandle {
    save: () => Promise<void>;
    format: () => Promise<void>;
    getCurrentFile: () => string | null;
    getEditor: () => Monaco.editor.IStandaloneCodeEditor | null;
    find: () => void;
    replace: () => void;
}

interface EditorPaneProps {
    tabs: Tab[];
    activeTabId: string | null;
    paneId: string;
    onTabSelect: (tabId: string) => void;
    onTabClose: (tabId: string) => void;
    onTabDrop?: (data: TabDropData) => void;
    onFileLoaded?: (path: string | null) => void;
    onCursorChange?: (line: number) => void;
    exportStatus?: ExportStatus;
    onActivate?: () => void;
}

/**
 * Computes a simple hash checksum of the given content.
 * Uses the same algorithm as the backend (main.ts) to ensure consistency.
 *
 * This is a fast, non-cryptographic hash suitable for detecting file changes.
 * It's used by auto-save to detect if a file was modified externally.
 */
function computeChecksum(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
    }
    return hash.toString(16);
}

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(function EditorPane(
    { tabs, activeTabId, paneId, onTabSelect, onTabClose, onTabDrop, onFileLoaded, onCursorChange, exportStatus, onActivate },
    ref
) {
    const [fileToOpen, setFileToOpen] = useState<string | null>(null);
    const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const [vimStatusNode, setVimStatusNode] = useState<HTMLDivElement | null>(null);
    const editorRef = useRef<EditorHandle>(null);
    const previousTabsRef = useRef<Tab[]>(tabs);
    const latestOnFileLoaded = useRef(onFileLoaded);
    const latestOnCursorChange = useRef(onCursorChange);

    useEffect(() => {
        latestOnFileLoaded.current = onFileLoaded;
    }, [onFileLoaded]);

    useEffect(() => {
        latestOnCursorChange.current = onCursorChange;
    }, [onCursorChange]);

    const activeTab = useMemo(() => {
        return tabs.find(tab => tab.id === activeTabId) ?? null;
    }, [tabs, activeTabId]);

    const isPreviewTab = activeTab?.type === 'preview';

    /**
     * AUTO-SAVE SYSTEM
     *
     * Design goals:
     * 1. Automatically save user work to prevent data loss
     * 2. Never overwrite external changes (e.g., if another editor modifies the file)
     * 3. Only save when the user is actively using the editor (window focused)
     *
     * How it works:
     * - When window gains focus: start a 5-minute interval timer and capture file checksum
     * - When window loses focus: stop the timer (prevents saving stale content)
     * - On each interval tick: compare disk checksum with captured checksum
     *   - If match: safe to save, update checksum to new content
     *   - If mismatch: file was modified externally, take new checksum but don't save
     * - On manual save (Cmd+S): reset interval and checksum
     *
     * The checksum comparison prevents a common scenario:
     * 1. User opens file in Lex, makes edits
     * 2. User switches to another app (auto-save stops)
     * 3. User edits the same file in another editor and saves
     * 4. User returns to Lex (auto-save resumes with fresh checksum)
     * 5. Auto-save won't overwrite because checksums don't match
     */
    const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    /** Checksum of file on disk when interval started. Used to detect external modifications. */
    const autoSaveChecksumRef = useRef<string | null>(null);

    useEffect(() => {
        const activeTab = tabs.find(tab => tab.id === activeTabId);
        if (activeTab) {
            // Don't set fileToOpen for preview tabs - they don't have a real file path
            if (activeTab.type !== 'preview') {
                setFileToOpen(activeTab.path);
            } else {
                setFileToOpen(null);
            }
        } else {
            setFileToOpen(null);
            if (tabs.length === 0) {
                latestOnFileLoaded.current?.(null);
            }
        }
    }, [tabs, activeTabId]);

    useEffect(() => {
        const previous = previousTabsRef.current;
        const removedTabs = previous.filter(prevTab => !tabs.some(tab => tab.id === prevTab.id));
        removedTabs.forEach(tab => editorRef.current?.closeFile(tab.path));
        previousTabsRef.current = tabs;
    }, [tabs]);

    const handleTabSelect = useCallback((tabId: string) => {
        onActivate?.();
        onTabSelect(tabId);
    }, [onTabSelect, onActivate]);

    const handleTabClose = useCallback((tabId: string) => {
        onTabClose(tabId);
    }, [onTabClose]);

    const handleFileLoaded = useCallback((path: string) => {
        // Update editor reference
        setEditor(editorRef.current?.getEditor() ?? null);
        latestOnFileLoaded.current?.(path);
    }, []);

    /**
     * Starts the auto-save interval timer.
     *
     * Called when:
     * - Window gains focus
     * - After a manual save (to reset the timer)
     *
     * Captures the current file's checksum from disk as the baseline for
     * detecting external modifications.
     */
    const startAutoSaveInterval = useCallback(async () => {
        // Clear any existing interval to avoid duplicates
        if (autoSaveIntervalRef.current) {
            clearInterval(autoSaveIntervalRef.current);
            autoSaveIntervalRef.current = null;
        }

        const currentFile = editorRef.current?.getCurrentFile();
        if (!currentFile) return;

        // Capture checksum of file on disk - this is our baseline for detecting external changes
        const diskChecksum = await window.ipcRenderer.fileChecksum(currentFile);
        autoSaveChecksumRef.current = diskChecksum;

        autoSaveIntervalRef.current = setInterval(async () => {
            const filePath = editorRef.current?.getCurrentFile();
            const editorInstance = editorRef.current?.getEditor();
            if (!filePath || !editorInstance) return;

            // Read current checksum from disk to check for external modifications
            const currentDiskChecksum = await window.ipcRenderer.fileChecksum(filePath);

            if (currentDiskChecksum === autoSaveChecksumRef.current) {
                // Checksum matches - file hasn't been modified externally, safe to save
                const content = editorInstance.getValue();
                await window.ipcRenderer.fileSave(filePath, content);
                // Update our baseline checksum to the new content we just saved
                autoSaveChecksumRef.current = computeChecksum(content);
                console.log('[AutoSave] Saved file:', filePath);
            } else {
                // Checksum mismatch - file was modified by another program.
                // Don't overwrite! Instead, update our baseline to the new checksum.
                // This breaks potential infinite loops where we'd never save because
                // checksums keep mismatching.
                autoSaveChecksumRef.current = currentDiskChecksum;
                console.log('[AutoSave] File modified externally, skipping save:', filePath);
            }
        }, AUTO_SAVE_INTERVAL_MS);
    }, []);

    /**
     * Stops the auto-save interval timer.
     *
     * Called when:
     * - Window loses focus (user switched to another app)
     * - Component unmounts
     *
     * Stopping on blur is critical: if the user switches apps and edits the file
     * elsewhere, we don't want a stale auto-save to overwrite their changes.
     */
    const stopAutoSaveInterval = useCallback(() => {
        if (autoSaveIntervalRef.current) {
            clearInterval(autoSaveIntervalRef.current);
            autoSaveIntervalRef.current = null;
        }
        autoSaveChecksumRef.current = null;
    }, []);

    /**
     * Manual save handler.
     *
     * After saving, resets the auto-save interval. This ensures:
     * 1. The timer restarts from zero (user gets full 5 minutes before next auto-save)
     * 2. The checksum is updated to reflect the just-saved content
     */
    const handleSave = useCallback(async () => {
        await editorRef.current?.save();
        // Reset auto-save interval after manual save
        await startAutoSaveInterval();
    }, [startAutoSaveInterval]);

    const handleFormat = useCallback(async () => {
        await editorRef.current?.format();
    }, []);

    /**
     * Window focus tracking for auto-save.
     *
     * Why focus-based?
     * - Only save when user is actively using the editor
     * - Prevents saving stale content when user is away
     * - Allows safe editing of the same file in other applications
     */
    useEffect(() => {
        const handleFocus = () => {
            startAutoSaveInterval();
        };

        const handleBlur = () => {
            stopAutoSaveInterval();
        };

        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);

        // Start interval if window is already focused on mount
        if (document.hasFocus()) {
            startAutoSaveInterval();
        }

        return () => {
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('blur', handleBlur);
            stopAutoSaveInterval();
        };
    }, [startAutoSaveInterval, stopAutoSaveInterval]);

    // Listen for cursor position changes
    useEffect(() => {
        if (!editor || !latestOnCursorChange.current) return;

        const disposable = editor.onDidChangeCursorPosition((e) => {
            // Monaco uses 1-based lines, LSP uses 0-based
            latestOnCursorChange.current?.(e.position.lineNumber - 1);
        });

        // Emit initial position
        const pos = editor.getPosition();
        if (pos) {
            latestOnCursorChange.current?.(pos.lineNumber - 1);
        }

        return () => disposable.dispose();
    }, [editor]);

    const handleFind = useCallback(() => {
        editorRef.current?.find();
    }, []);

    const handleReplace = useCallback(() => {
        editorRef.current?.replace();
    }, []);

    useImperativeHandle(ref, () => ({
        save: handleSave,
        format: handleFormat,
        getCurrentFile: () => editorRef.current?.getCurrentFile() ?? null,
        getEditor: () => editorRef.current?.getEditor() ?? null,
        find: handleFind,
        replace: handleReplace,
    }), [handleSave, handleFormat, handleFind, handleReplace]);

    return (
        <div className="flex flex-col flex-1 min-h-0" onMouseDown={() => onActivate?.()}>
            <TabBar
                tabs={tabs}
                activeTabId={activeTabId}
                paneId={paneId}
                onTabSelect={handleTabSelect}
                onTabClose={handleTabClose}
                onTabDrop={onTabDrop}
            />
            <div className="flex-1 min-h-0">
                {isPreviewTab && activeTab?.previewContent ? (
                    <PreviewPane content={activeTab.previewContent} />
                ) : (
                    <Editor
                        ref={editorRef}
                        fileToOpen={fileToOpen}
                        onFileLoaded={handleFileLoaded}
                        vimStatusNode={vimStatusNode}
                    />
                )}
            </div>
            {!isPreviewTab && (
                <StatusBar
                    editor={editor}
                    exportStatus={exportStatus}
                    onVimStatusNodeChange={setVimStatusNode}
                />
            )}
        </div>
    );
});
