import { useEffect } from 'react';

interface MenuHandlers {
  onNewFile?: () => void;
  onOpenFile?: () => void;
  onOpenFolder?: () => void;
  onSave?: () => void;
  onFormat?: () => void;
  onExport?: (format: string) => void;
  onFind?: () => void;
  onReplace?: () => void;
  onSplitVertical?: () => void;
  onSplitHorizontal?: () => void;
  onPreview?: () => void;
  onInsertAsset?: () => void;
  onInsertVerbatim?: () => void;
  onNextAnnotation?: () => void;
  onPrevAnnotation?: () => void;
  onResolveAnnotation?: () => void;
  onToggleAnnotations?: () => void;
  onOpenFilePath?: (filePath: string) => void;
}

export function useMenuHandlers(handlers: MenuHandlers) {
  const {
    onNewFile,
    onOpenFile,
    onOpenFolder,
    onSave,
    onFormat,
    onExport,
    onFind,
    onReplace,
    onSplitVertical,
    onSplitHorizontal,
    onPreview,
    onInsertAsset,
    onInsertVerbatim,
    onNextAnnotation,
    onPrevAnnotation,
    onResolveAnnotation,
    onToggleAnnotations,
    onOpenFilePath,
  } = handlers;

  useEffect(() => {
    const subscriptions: Array<() => void> = [];

    const register = (unsubscribe?: () => void) => {
      if (unsubscribe) {
        subscriptions.push(unsubscribe);
      }
    };

    if (onNewFile) register(window.ipcRenderer.onMenuNewFile(onNewFile));
    if (onOpenFile) register(window.ipcRenderer.onMenuOpenFile(onOpenFile));
    if (onOpenFolder) register(window.ipcRenderer.onMenuOpenFolder(onOpenFolder));
    if (onSave) register(window.ipcRenderer.onMenuSave(onSave));
    if (onFormat) register(window.ipcRenderer.onMenuFormat(onFormat));
    if (onExport) register(window.ipcRenderer.onMenuExport(onExport));
    if (onFind) register(window.ipcRenderer.onMenuFind(onFind));
    if (onReplace) register(window.ipcRenderer.onMenuReplace(onReplace));
    if (onSplitVertical) register(window.ipcRenderer.onMenuSplitVertical(onSplitVertical));
    if (onSplitHorizontal) register(window.ipcRenderer.onMenuSplitHorizontal(onSplitHorizontal));
    if (onPreview) register(window.ipcRenderer.onMenuPreview(onPreview));
    if (onInsertAsset) register(window.ipcRenderer.on('menu-insert-asset', onInsertAsset));
    if (onInsertVerbatim) register(window.ipcRenderer.on('menu-insert-verbatim', onInsertVerbatim));
    if (onNextAnnotation) register(window.ipcRenderer.on('menu-next-annotation', onNextAnnotation));
    if (onPrevAnnotation) register(window.ipcRenderer.on('menu-prev-annotation', onPrevAnnotation));
    if (onResolveAnnotation) register(window.ipcRenderer.on('menu-resolve-annotation', onResolveAnnotation));
    if (onToggleAnnotations) register(window.ipcRenderer.on('menu-toggle-annotations', onToggleAnnotations));
    if (onOpenFilePath) register(window.ipcRenderer.onOpenFilePath(onOpenFilePath));

    return () => {
      subscriptions.forEach(unsub => unsub());
    };
  }, [
    onNewFile,
    onOpenFile,
    onOpenFolder,
    onSave,
    onFormat,
    onExport,
    onFind,
    onReplace,
    onSplitVertical,
    onSplitHorizontal,
    onPreview,
    onInsertAsset,
    onInsertVerbatim,
    onNextAnnotation,
    onPrevAnnotation,
    onResolveAnnotation,
    onToggleAnnotations,
    onOpenFilePath,
  ]);
}
