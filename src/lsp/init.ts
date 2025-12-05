import { lspClient } from './client';

let initializePromise: Promise<void> | null = null;

export function ensureLspInitialized(rootPath?: string) {
  if (!initializePromise) {
    initializePromise = lspClient.start(rootPath || '').catch(error => {
      console.error('LSP initialization failed', error);
      throw error;
    });
  }
  return initializePromise;
}
