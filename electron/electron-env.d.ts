/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer & {
    fileOpen: () => Promise<{ filePath: string; content: string } | null>;
    fileSave: (filePath: string, content: string) => Promise<boolean>;
    fileReadDir: (dirPath: string) => Promise<Array<{ name: string; isDirectory: boolean; path: string }>>;
    fileRead: (filePath: string) => Promise<string | null>;
    folderOpen: () => Promise<string | null>;
    getInitialFolder: () => Promise<string>;
    setLastFolder: (folderPath: string) => Promise<boolean>;
    getNativeTheme: () => Promise<'dark' | 'light'>;
    onNativeThemeChanged: (callback: (theme: 'dark' | 'light') => void) => () => void;
    onOpenFilePath: (callback: (filePath: string) => void) => () => void;
  }
}
