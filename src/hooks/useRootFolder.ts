import { useEffect, useState } from 'react';

export function useRootFolder() {
  const [rootPath, setRootPath] = useState<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    const loadInitialFolder = async () => {
      try {
        const folder = await window.ipcRenderer.getInitialFolder();
        if (mounted && folder) {
          setRootPath(folder);
        }
      } catch (error) {
        console.error('useRootFolder: failed to load initial folder', error);
      }
    };
    loadInitialFolder();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (rootPath) {
      const folderName = rootPath.split('/').pop() || rootPath;
      document.title = `LexEd - ${folderName}`;
      (window as any).__lexWorkspaceRoot = rootPath;
    } else {
      document.title = 'LexEd';
      if ((window as any).__lexWorkspaceRoot) {
        delete (window as any).__lexWorkspaceRoot;
      }
    }
  }, [rootPath]);

  return { rootPath, setRootPath };
}
