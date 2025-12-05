import { useEffect } from 'react';

export function useMenuStateSync(hasOpenFile: boolean, isLexFile: boolean) {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const { ipcRenderer } = window;
    if (!ipcRenderer?.updateMenuState) {
      return;
    }
    ipcRenderer.updateMenuState({ hasOpenFile, isLexFile });
  }, [hasOpenFile, isLexFile]);
}
