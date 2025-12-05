import { useEffect } from 'react';
import * as monaco from 'monaco-editor';
import type { EditorPaneHandle } from '@/components/EditorPane';
import type { PaneState } from '@/panes/types';

type FormattingRequestPayload = {
  type: 'document' | 'range';
  params: unknown;
};

let lastFormattingRequest: FormattingRequestPayload | null = null;

interface UseLexTestBridgeOptions {
  activePaneId: string | null;
  paneHandles: React.MutableRefObject<Map<string, EditorPaneHandle | null>>;
  panesRef: React.MutableRefObject<PaneState[]>;
  panes: PaneState[];
  openFileInPane: (paneId: string, path: string) => void;
}

export function useLexTestBridge({
  activePaneId,
  paneHandles,
  panesRef,
  panes,
  openFileInPane,
}: UseLexTestBridgeOptions) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.ipcRenderer?.loadTestFixture) return;

    const waitForPaneFile = async (paneId: string, filePath: string, timeoutMs = 5000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const pane = panesRef.current.find(p => p.id === paneId);
        if (pane?.currentFile === filePath) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out opening fixture ${filePath}`);
    };

    const api = {
      openFixture: async (fixtureName: string, targetPaneId?: string | null) => {
        const fixture = await window.ipcRenderer.loadTestFixture(fixtureName);
        const target = targetPaneId ?? activePaneId ?? panes[0]?.id ?? null;
        if (!target) {
          throw new Error('No pane available for fixture');
        }
        openFileInPane(target, fixture.path);
        await waitForPaneFile(target, fixture.path);
        return fixture;
      },
      readFixture: (fixtureName: string) => window.ipcRenderer.loadTestFixture(fixtureName),
      getActiveEditorValue: () => {
        const target = activePaneId ?? panesRef.current[0]?.id ?? null;
        if (!target) {
          return '';
        }
        const editorInstance = paneHandles.current.get(target)?.getEditor();
        return editorInstance?.getValue() ?? '';
      },
      setActiveEditorValue: (value: string) => {
        const target = activePaneId ?? panesRef.current[0]?.id ?? null;
        if (!target) {
          return false;
        }
        const editorInstance = paneHandles.current.get(target)?.getEditor();
        if (!editorInstance) {
          return false;
        }
        editorInstance.setValue(value);
        return true;
      },
      triggerMockDiagnostics: () => {
        const target = activePaneId ?? panesRef.current[0]?.id ?? null;
        if (!target) {
          return false;
        }
        const editorInstance = paneHandles.current.get(target)?.getEditor();
        const model = editorInstance?.getModel?.();
        if (!model) {
          return false;
        }
        const lastColumn = model.getLineLength(1) + 1;
        monaco.editor.setModelMarkers(model, 'lex-test', [
          {
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: lastColumn,
            message: 'Mock diagnostic for testing',
            source: 'lex-test',
          },
        ]);
        return true;
      },
      notifyFormattingRequest: (payload: FormattingRequestPayload) => {
        lastFormattingRequest = payload;
      },
      getLastFormattingRequest: () => lastFormattingRequest,
      resetFormattingRequest: () => {
        lastFormattingRequest = null;
      },
      // Expose markers for testing diagnostics via API
      getMarkers: () => {
         const target = activePaneId ?? panesRef.current[0]?.id ?? null;
         if (!target) return [];
         const editorInstance = paneHandles.current.get(target)?.getEditor();
         const model = editorInstance?.getModel?.();
         if (!model) return [];
         return monaco.editor.getModelMarkers({ resource: model.uri });
      },
    };
    window.lexTest = api;
    return () => {
      if (window.lexTest === api) {
        delete window.lexTest;
      }
    };
  }, [activePaneId, openFileInPane, panes, paneHandles, panesRef]);
}
