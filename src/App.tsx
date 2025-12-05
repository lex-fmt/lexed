import { useState, useEffect, useRef, useCallback } from 'react'
import * as monaco from 'monaco-editor'
import { toast } from 'sonner'
import type { EditorPaneHandle } from './components/EditorPane'
import { Layout } from './components/Layout'
import { Outline } from './components/Outline'
import { ExportStatus } from './components/StatusBar'
import type { Tab } from './components/TabBar'
import { PaneWorkspace } from './components/PaneWorkspace'
import { usePersistedPaneLayout } from '@/panes/usePersistedPaneLayout'
import { usePaneManager } from '@/panes/usePaneManager'
import { insertAsset, insertVerbatim, resolveAnnotation, toggleAnnotations } from './features/editing'
import { nextAnnotation, previousAnnotation } from './features/navigation'
import { exportContent, importContent, convertToHtml } from './features/interop'
import { isLexFile } from '@/lib/files'
import { createPreviewTab, placePreviewTab } from '@/features/preview'
import { useRootFolder } from '@/hooks/useRootFolder'
import { useMenuStateSync } from '@/hooks/useMenuStateSync'
import { useLexTestBridge } from '@/hooks/useLexTestBridge'
import { useMenuHandlers } from '@/hooks/useMenuHandlers'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { dispatchFileTreeRefresh } from '@/lib/events'
import log from 'electron-log/renderer';

const createTabFromPath = (path: string): Tab => ({
  id: path,
  path,
  name: path.split('/').pop() || path,
});

function App() {
  const {
    panes,
    paneRows,
    setPanes,
    setPaneRows,
    setActivePaneId,
    resolvedActivePane,
    resolvedActivePaneId,
  } = usePersistedPaneLayout(createTabFromPath);
  const { rootPath, setRootPath } = useRootFolder();
  const [exportStatus, setExportStatus] = useState<ExportStatus>({ isExporting: false, format: null });
  const paneHandles = useRef(new Map<string, EditorPaneHandle | null>());
  const panesRef = useRef(panes);

  const activePaneIdValue = resolvedActivePaneId;
  const activePaneFile = resolvedActivePane?.currentFile ?? null;
  const isActiveFileLex = isLexFile(activePaneFile ?? null);
  const activeCursorLine = resolvedActivePane?.cursorLine ?? 0;
  const activeEditor = activePaneIdValue
    ? paneHandles.current.get(activePaneIdValue)?.getEditor() ?? null
    : null;

  useEffect(() => {
    panesRef.current = panes;
  }, [panes]);

  useMenuStateSync(Boolean(activePaneFile), isActiveFileLex);

  const registerPaneHandle = useCallback(
    (paneId: string) => (instance: EditorPaneHandle | null) => {
      if (!instance) {
        return;
      }
      const currentInstance = paneHandles.current.get(paneId) ?? null;
      if (currentInstance === instance) {
        return;
      }
      paneHandles.current.set(paneId, instance);
    },
    []
  );

  useEffect(() => {
    const ids = new Set(panes.map(pane => pane.id));
    for (const [paneId] of paneHandles.current) {
      if (!ids.has(paneId)) {
        paneHandles.current.delete(paneId);
      }
    }
  }, [panes]);

  const {
    focusPane,
    handleSplitVertical,
    handleSplitHorizontal,
    handleClosePane,
    openFileInPane,
    handleTabSelect,
    handleTabClose,
    handleTabDrop,
    handlePaneFileLoaded,
    handlePaneCursorChange,
  } = usePaneManager({
    activePaneId: activePaneIdValue,
    setActivePaneId,
    setPanes,
    setPaneRows,
    createTabFromPath,
  });

  useLexTestBridge({
    activePaneId: activePaneIdValue,
    paneHandles,
    panesRef,
    panes,
    openFileInPane,
  });

  const handleNewFile = useCallback(async () => {
    log.info('Action: New File');
    if (!activePaneIdValue) return;
    const result = await window.ipcRenderer.fileNew(rootPath);
    if (result) {
      log.debug('New file created', result.filePath);
      openFileInPane(activePaneIdValue, result.filePath);
      dispatchFileTreeRefresh();
    }
  }, [rootPath, activePaneIdValue, openFileInPane]);

  const handleOpenFolder = useCallback(async () => {
    log.info('Action: Open Folder');
    const result = await window.ipcRenderer.invoke('folder-open') as string | null;
    if (result) {
      setRootPath(result);
      await window.ipcRenderer.setLastFolder(result);
    }
  }, [setRootPath]);

  const handleOpenFile = useCallback(async () => {
    log.info('Action: Open File');
    if (!activePaneIdValue) return;
    const result = await window.ipcRenderer.fileOpen();
    if (result) {
      log.debug('File opened', result.filePath);
      openFileInPane(activePaneIdValue, result.filePath);
    }
  }, [activePaneIdValue, openFileInPane]);

  const handleSave = useCallback(async () => {
    log.info('Action: Save');
    if (!activePaneIdValue) return;
    const handle = paneHandles.current.get(activePaneIdValue);
    await handle?.save();
  }, [activePaneIdValue]);

  const handleFormat = useCallback(async () => {
    log.info('Action: Format');
    if (!activePaneIdValue) return;
    const handle = paneHandles.current.get(activePaneIdValue);
    await handle?.format();
  }, [activePaneIdValue]);

  const handleFind = useCallback(() => {
    if (!activePaneIdValue) return;
    paneHandles.current.get(activePaneIdValue)?.find();
  }, [activePaneIdValue]);

  const handleReplace = useCallback(() => {
    if (!activePaneIdValue) return;
    paneHandles.current.get(activePaneIdValue)?.replace();
  }, [activePaneIdValue]);

  const handleShareWhatsApp = useCallback(async () => {
    if (!activeEditor) {
      toast.error('No document to share');
      return;
    }
    const content = activeEditor.getValue();
    if (!content.trim()) {
      toast.error('Document is empty');
      return;
    }
    await window.ipcRenderer.shareWhatsApp(content);
  }, [activeEditor]);

  const handleConvertToLex = useCallback(async () => {
    if (!activePaneFile || !activePaneIdValue) {
      toast.error('No file open to convert');
      return;
    }

    const handle = paneHandles.current.get(activePaneIdValue);
    const editor = handle?.getEditor();
    if (!editor) {
      toast.error('No active editor');
      return;
    }

    setExportStatus({ isExporting: true, format: 'lex' });

    try {
      // Import markdown content to lex via LSP
      const content = editor.getValue();
      const lexContent = await importContent(content, 'markdown');

      // Write to file with .lex extension
      const outputPath = activePaneFile.replace(/\.(md|markdown)$/i, '.lex');
      await window.ipcRenderer.invoke('file-save', outputPath, lexContent);

      const fileName = outputPath.split('/').pop() || outputPath;
      toast.success(`Converted to ${fileName}`);
      openFileInPane(activePaneIdValue, outputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Conversion failed';
      toast.error(message);
    } finally {
      setExportStatus({ isExporting: false, format: null });
    }
  }, [activePaneFile, activePaneIdValue, openFileInPane]);

  const handleExport = useCallback(async (format: string) => {
    if (!activePaneFile) {
      toast.error('No file open to export');
      return;
    }

    if (!activePaneIdValue) return;
    const handle = paneHandles.current.get(activePaneIdValue);
    const editor = handle?.getEditor();
    if (!editor) {
      toast.error('No active editor');
      return;
    }

    setExportStatus({ isExporting: true, format });

    try {
      const content = editor.getValue();
      const sourceUri = `file://${activePaneFile}`;

      // Calculate output path
      const ext = format === 'markdown' ? 'md' : format;
      const outputPath = activePaneFile.replace(/\.lex$/i, `.${ext}`);

      if (format === 'pdf') {
        // PDF is binary - LSP writes directly to file
        await exportContent(content, 'pdf', sourceUri, outputPath);
      } else {
        // Text formats - get content from LSP and write to file
        const result = await exportContent(content, format as 'markdown' | 'html', sourceUri);
        await window.ipcRenderer.invoke('file-save', outputPath, result);
      }

      const fileName = outputPath.split('/').pop() || outputPath;
      toast.success(`Exported to ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      toast.error(message);
    } finally {
      setExportStatus({ isExporting: false, format: null });
    }
  }, [activePaneFile, activePaneIdValue]);

  const handlePreview = useCallback(async () => {
    if (!activePaneFile || !isLexFile(activePaneFile)) {
      toast.error('Preview requires a .lex file');
      return;
    }

    if (!activePaneIdValue) {
      return;
    }

    const handle = paneHandles.current.get(activePaneIdValue);
    const editor = handle?.getEditor();
    if (!editor) {
      toast.error('No active editor');
      return;
    }

    try {
      // Get content from editor and convert to HTML via LSP
      const content = editor.getValue();
      const htmlContent = await convertToHtml(content);
      const previewTab = createPreviewTab(activePaneFile, htmlContent);
      placePreviewTab({
        activePaneId: activePaneIdValue,
        panes,
        previewTab,
        setPanes,
        setPaneRows,
        setActivePaneId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preview failed';
      toast.error(message);
    }
  }, [activePaneFile, activePaneIdValue, panes, setActivePaneId, setPaneRows, setPanes]);

  const handleFileSelect = useCallback((path: string) => {
    if (!activePaneIdValue) return;
    openFileInPane(activePaneIdValue, path);
  }, [activePaneIdValue, openFileInPane]);

  const handleInsertAsset = useCallback(async () => {
    log.info('Action: Insert Asset');
    console.log('handleInsertAsset called');
    if (!activeEditor) {
      console.log('handleInsertAsset: no active editor');
      return;
    }
    const path = await window.ipcRenderer.invoke('file-pick', {
      title: 'Select Asset',
      filters: [{ name: 'All Files', extensions: ['*'] }]
    }) as string | null;
    console.log('handleInsertAsset: path selected', path);
    if (path) {
      await insertAsset(activeEditor, path);
    }
  }, [activeEditor]);

  const handleInsertVerbatim = useCallback(async () => {
    if (!activeEditor) return;
    const path = await window.ipcRenderer.invoke('file-pick', {
      title: 'Select File for Verbatim Block',
      filters: [{ name: 'All Files', extensions: ['*'] }]
    }) as string | null;
    if (path) {
      await insertVerbatim(activeEditor, path);
    }
  }, [activeEditor]);

  const handleNextAnnotation = useCallback(async () => {
    if (!activeEditor) return;
    const location = await nextAnnotation(activeEditor);
    if (location) {
      // If location is in another file, we might need to open it.
      // For now, assuming same file navigation or that LSP handles file switching if we implement it fully.
      // But monaco-editor is single model usually unless we handle it.
      // The current implementation of nextAnnotation returns a Location.
      // If it's the same file, we can just reveal it.
      // If it's a different file, we need to open it.

      // Check if URI matches current model
      const currentUri = activeEditor.getModel()?.uri.toString();
      if (location.uri === currentUri) {
        const pos = new monaco.Position(location.range.start.line + 1, location.range.start.character + 1);
        activeEditor.setPosition(pos);
        activeEditor.revealPosition(pos);
      } else {
        // TODO: Handle navigation to other files
        // For now, let's just log it or toast
        toast.info('Annotation is in another file: ' + location.uri);
      }
    } else {
      log.info('No more annotations');
      toast.info('No more annotations');
    }
  }, [activeEditor]);

  const handlePrevAnnotation = useCallback(async () => {
    if (!activeEditor) return;
    const location = await previousAnnotation(activeEditor);
    if (location) {
      const currentUri = activeEditor.getModel()?.uri.toString();
      if (location.uri === currentUri) {
        const pos = new monaco.Position(location.range.start.line + 1, location.range.start.character + 1);
        activeEditor.setPosition(pos);
        activeEditor.revealPosition(pos);
      } else {
        toast.info('Annotation is in another file: ' + location.uri);
      }
    } else {
      toast.info('No previous annotations');
    }
  }, [activeEditor]);

  const handleResolveAnnotation = useCallback(async () => {
    if (!activeEditor) return;
    await resolveAnnotation(activeEditor);
  }, [activeEditor]);

  const handleToggleAnnotations = useCallback(async () => {
    if (!activeEditor) return;
    await toggleAnnotations(activeEditor);
  }, [activeEditor]);

  const handleOpenFilePath = useCallback((filePath: string) => {
    if (!activePaneIdValue) return;
    openFileInPane(activePaneIdValue, filePath);
  }, [activePaneIdValue, openFileInPane]);

  useMenuHandlers({
    onNewFile: handleNewFile,
    onOpenFile: handleOpenFile,
    onOpenFolder: handleOpenFolder,
    onSave: handleSave,
    onFormat: handleFormat,
    onExport: handleExport,
    onFind: handleFind,
    onReplace: handleReplace,
    onSplitVertical: handleSplitVertical,
    onSplitHorizontal: handleSplitHorizontal,
    onPreview: handlePreview,
    onInsertAsset: handleInsertAsset,
    onInsertVerbatim: handleInsertVerbatim,
    onNextAnnotation: handleNextAnnotation,
    onPrevAnnotation: handlePrevAnnotation,
    onResolveAnnotation: handleResolveAnnotation,
    onToggleAnnotations: handleToggleAnnotations,
    onOpenFilePath: handleOpenFilePath,
  });

  // ... imports

  return (
    <SettingsProvider>
      <Layout
        rootPath={rootPath}
        onFileSelect={handleFileSelect}
        onNewFile={handleNewFile}
        onOpenFolder={handleOpenFolder}
        onOpenFile={handleOpenFile}
        onSave={handleSave}
        onFormat={handleFormat}
        onExport={handleExport}
        onShareWhatsApp={handleShareWhatsApp}
        onConvertToLex={handleConvertToLex}
        onFind={handleFind}
        onReplace={handleReplace}
        onSplitVertical={handleSplitVertical}
        onSplitHorizontal={handleSplitHorizontal}
        onPreview={handlePreview}
        currentFile={activePaneFile}
        panel={
          <Outline
            currentFile={activePaneFile}
            editor={activeEditor}
            cursorLine={activeCursorLine}
          />
        }
      >
        <PaneWorkspace
          panes={panes}
          paneRows={paneRows}
          activePaneId={activePaneIdValue}
          exportStatus={exportStatus}
          registerPaneHandle={registerPaneHandle}
          onFocusPane={focusPane}
          onClosePane={handleClosePane}
          onTabSelect={handleTabSelect}
          onTabClose={handleTabClose}
          onTabDrop={handleTabDrop}
          onFileLoaded={handlePaneFileLoaded}
          onCursorChange={handlePaneCursorChange}
          onPaneRowsChange={setPaneRows}
        />
      </Layout>
    </SettingsProvider>
  )
}

export default App
