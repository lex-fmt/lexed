/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useEffect, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import * as monaco from 'monaco-editor';
import 'monaco-editor';
import { initializeMonaco, applyTheme, type ThemeMode } from '@/monaco';
import { getOrCreateModel, disposeModel } from '@/monaco/models';
import { ensureLspInitialized } from '@/lsp/init';
import { initVimMode } from 'monaco-vim';
import { useSettings } from '@/contexts/SettingsContext';
import { lspClient } from '@/lsp/client';
import { buildFormattingOptions, notifyLexTest } from '@/lsp/providers/formatting';
import type { LspTextEdit } from '@/lsp/types';
import { dispatchFileTreeRefresh } from '@/lib/events';

initializeMonaco();

interface EditorProps {
  fileToOpen?: string | null;
  onFileLoaded?: (path: string) => void;
  vimStatusNode?: HTMLDivElement | null;
}

export interface EditorHandle {
  openFile: () => Promise<void>;
  save: () => Promise<void>;
  format: () => Promise<void>;
  getCurrentFile: () => string | null;
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null;
  switchToFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
  find: () => void;
  replace: () => void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({ fileToOpen, onFileLoaded, vimStatusNode }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const vimModeRef = useRef<any>(null);
  const attachedStatusNodeRef = useRef<HTMLDivElement | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const { settings } = useSettings();

  const formatWithLsp = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model || model.getLanguageId() !== 'lex') {
      return;
    }

    const modelOptions = model.getOptions();
    const tabSize = modelOptions.tabSize ?? 4;
    const insertSpaces = modelOptions.insertSpaces ?? true;
    const params = {
      textDocument: { uri: model.uri.toString() },
      options: buildFormattingOptions(tabSize, insertSpaces),
    };
    notifyLexTest({ type: 'document', params });

    let edits: LspTextEdit[] | null = null;
    try {
      edits = await lspClient.sendRequest('textDocument/formatting', params);
    } catch (error) {
      console.error('[LSP] Formatting failed:', error);
      return;
    }

    if (!edits || edits.length === 0) {
      return;
    }

    const monacoEdits = edits.map(edit => ({
      range: new monaco.Range(
        edit.range.start.line + 1,
        edit.range.start.character + 1,
        edit.range.end.line + 1,
        edit.range.end.character + 1,
      ),
      text: edit.newText,
    }));

    editor.pushUndoStop();
    editor.executeEdits('lex-format', monacoEdits);
    editor.pushUndoStop();
  }, []);

  const switchToFile = useCallback(async (path: string) => {
    if (!editorRef.current) return;
    let model = monaco.editor.getModel(monaco.Uri.file(path));

    if (!model || model.isDisposed()) {
      const content = await window.ipcRenderer.invoke('file-read', path) as string | null;
      if (content === null) return;
      model = getOrCreateModel(path, content);
    }

    editorRef.current.setModel(model);
    setCurrentFile(path);
    onFileLoaded?.(path);
  }, [onFileLoaded]);

  const closeFile = (path: string) => {
    disposeModel(path);
  };

  useImperativeHandle(ref, () => ({
    openFile: handleOpen,
    save: handleSave,
    format: formatWithLsp,
    getCurrentFile: () => currentFile,
    getEditor: () => editorRef.current,
    switchToFile,
    closeFile,
    find: () => {
      editorRef.current?.trigger('menu', 'actions.find', null);
    },
    replace: () => {
      editorRef.current?.trigger('menu', 'editor.action.startFindReplaceAction', null);
    },
  }));

  useEffect(() => {
    if (fileToOpen) {
      void switchToFile(fileToOpen);
    }
  }, [fileToOpen, switchToFile]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (!settings.editor.vimMode || !vimStatusNode) {
      if (vimModeRef.current) {
        vimModeRef.current.dispose();
        vimModeRef.current = null;
      }
      if (attachedStatusNodeRef.current) {
        attachedStatusNodeRef.current.textContent = '';
        attachedStatusNodeRef.current = null;
      }
      return;
    }

    if (vimModeRef.current && attachedStatusNodeRef.current === vimStatusNode) {
      return;
    }

    if (vimModeRef.current) {
      vimModeRef.current.dispose();
      vimModeRef.current = null;
    }

    vimStatusNode.textContent = '';
    vimModeRef.current = initVimMode(editor, vimStatusNode);
    attachedStatusNodeRef.current = vimStatusNode;
  }, [settings.editor.vimMode, vimStatusNode]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Use specific root if provided, otherwise settings.lastFolder, or fallback
    // Note: getWelcomeFolderPath logic is technically main-process side, but here we can try to guess or use empty string
    // Ideally, we passed it in props or context.
    // But since this is specific to correct LSP rooting:
    const root = settings.lastFolder || '';
    ensureLspInitialized(root);

    const editor = monaco.editor.create(containerRef.current, {
      model: null,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      padding: { top: 10, bottom: 10 },
      fontFamily: 'Geist, -apple-system, BlinkMacSystemFont, sans-serif',
      'semanticHighlighting.enabled': true,
      rulers: settings.editor.showRuler ? [settings.editor.rulerWidth] : [],
    } satisfies monaco.editor.IStandaloneEditorConstructionOptions);
    editorRef.current = editor;

    // ... existing code

    const applyThemeFromNative = (mode: ThemeMode) => {
      applyTheme(mode);
    };

    const initialTheme = document.documentElement.getAttribute('data-theme');
    if (initialTheme === 'dark' || initialTheme === 'light') {
      applyThemeFromNative(initialTheme);
    } else {
      void window.ipcRenderer.getNativeTheme().then(applyThemeFromNative);
    }
    const unsubscribeTheme = window.ipcRenderer.onNativeThemeChanged(applyThemeFromNative);

    // Listen for insert commands
    const unsubscribeInsertAsset = window.ipcRenderer.on('menu-insert-asset', () => {
      if (editorRef.current) {
        import('../commands').then(({ insertAssetReference }) => {
          insertAssetReference(editorRef.current!);
        });
      }
    });

    const unsubscribeInsertVerbatim = window.ipcRenderer.on('menu-insert-verbatim', () => {
      if (editorRef.current) {
        import('../commands').then(({ insertVerbatimBlock }) => {
          insertVerbatimBlock(editorRef.current!);
        });
      }
    });

    return () => {
      editor.dispose();
      if (vimModeRef.current) {
        vimModeRef.current.dispose();
        vimModeRef.current = null;
      }
      if (attachedStatusNodeRef.current) {
        attachedStatusNodeRef.current.textContent = '';
        attachedStatusNodeRef.current = null;
      }
      unsubscribeTheme();
      unsubscribeInsertAsset();
      unsubscribeInsertVerbatim();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpen = async () => {
    const result = await window.ipcRenderer.fileOpen();
    if (result && editorRef.current) {
      const { filePath, content } = result;
      const model = getOrCreateModel(filePath, content);
      editorRef.current.setModel(model);
      setCurrentFile(filePath);
      onFileLoaded?.(filePath);
    }
  };

  const handleSave = async () => {
    if (currentFile && editorRef.current) {
      if (settings.formatter.formatOnSave) {
        await handleFormat();
      }
      await window.ipcRenderer.fileSave(currentFile, editorRef.current.getValue());
      dispatchFileTreeRefresh();
    }
  };

  const handleFormat = formatWithLsp;

  // ... existing code

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
});
