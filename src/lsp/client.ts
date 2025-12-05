import { createProtocolConnection, ProtocolConnection, Logger, InitializeParams, InitializeRequest, InitializedNotification } from 'vscode-languageserver-protocol/browser';
import { IpcMessageReader, IpcMessageWriter } from './ipc-connection';
import * as monaco from 'monaco-editor';
import { LspPublishDiagnosticsParams } from './types';
import log from 'electron-log/renderer';

export class LspClient {
    private connection: ProtocolConnection | null = null;
    private readyPromise: Promise<void> | null = null;
    private isDisposed = false;
    private retryCount = 0;
    private readonly maxRetries = 5;
    private baseRetryDelay = 1000;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
    }

    public start(rootPath?: string): Promise<void> {
        if (this.readyPromise) return this.readyPromise;

        this.readyPromise = this.initialize(rootPath);
        return this.readyPromise;
    }

    private async initialize(rootPath?: string): Promise<void> {
        if (this.isDisposed) return;

        log.debug(`[LspClient] Starting SimpleLspClient (Attempt ${this.retryCount + 1}/${this.maxRetries + 1})...`);
        
        try {
            const reader = new IpcMessageReader(window.ipcRenderer);
            const writer = new IpcMessageWriter(window.ipcRenderer);
            
            const logger: Logger = {
                error: (message) => log.error('[LSP]', message),
                warn: (message) => log.warn('[LSP]', message),
                info: (message) => log.info('[LSP]', message),
                log: (message) => log.debug('[LSP]', message)
            };

            this.connection = createProtocolConnection(reader, writer, logger);
            
            this.connection.onClose(() => {
                log.warn('[LspClient] Connection closed.');
                this.handleConnectionLoss();
            });

            this.connection.onError((error) => {
                log.error('[LspClient] Connection error:', error);
                this.handleConnectionLoss();
            });

            this.connection.listen();

            // Initialize
            const rootUri = rootPath ? monaco.Uri.file(rootPath).toString() : null;
            const initParams: InitializeParams = {
                processId: null,
                rootUri: rootUri,
                capabilities: {
                    textDocument: {
                        synchronization: {
                            dynamicRegistration: true,
                            willSave: false,
                            willSaveWaitUntil: false,
                            didSave: false
                        },
                        completion: {
                            dynamicRegistration: true,
                            completionItem: {
                                snippetSupport: true,
                                commitCharactersSupport: true,
                                documentationFormat: ['markdown', 'plaintext'],
                                deprecatedSupport: true,
                                preselectSupport: true
                            },
                            contextSupport: true
                        },
                        hover: {
                            dynamicRegistration: true,
                            contentFormat: ['markdown', 'plaintext']
                        },
                        signatureHelp: {
                            dynamicRegistration: true,
                            signatureInformation: {
                                documentationFormat: ['markdown', 'plaintext']
                            }
                        },
                        definition: { dynamicRegistration: true },
                        references: { dynamicRegistration: true },
                        documentHighlight: { dynamicRegistration: true },
                        documentSymbol: {
                            dynamicRegistration: true,
                            symbolKind: {
                                valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
                            }
                        },
                        codeAction: {
                            dynamicRegistration: true,
                            codeActionLiteralSupport: {
                                codeActionKind: {
                                    valueSet: ['', 'quickfix', 'refactor', 'refactor.extract', 'refactor.inline', 'refactor.rewrite', 'source', 'source.organizeImports']
                                }
                            }
                        },
                        codeLens: { dynamicRegistration: true },
                        formatting: { dynamicRegistration: true },
                        rangeFormatting: { dynamicRegistration: true },
                        onTypeFormatting: { dynamicRegistration: true },
                        rename: { dynamicRegistration: true },
                        documentLink: { dynamicRegistration: true },
                        typeDefinition: { dynamicRegistration: true },
                        implementation: { dynamicRegistration: true },
                        colorProvider: { dynamicRegistration: true },
                        foldingRange: { dynamicRegistration: true },
                        selectionRange: { dynamicRegistration: true },
                        publishDiagnostics: { relatedInformation: true },
                        semanticTokens: {
                            dynamicRegistration: true,
                            tokenTypes: [
                                'DocumentTitle', 'SessionMarker', 'SessionTitleText', 'DefinitionSubject', 'DefinitionContent',
                                'ListMarker', 'ListItemText', 'AnnotationLabel', 'AnnotationParameter', 'AnnotationContent',
                                'InlineStrong', 'InlineEmphasis', 'InlineCode', 'InlineMath', 'Reference', 'ReferenceCitation',
                                'ReferenceFootnote', 'VerbatimSubject', 'VerbatimLanguage', 'VerbatimAttribute', 'VerbatimContent',
                                'InlineMarker_strong_start', 'InlineMarker_strong_end', 'InlineMarker_emphasis_start', 'InlineMarker_emphasis_end',
                                'InlineMarker_code_start', 'InlineMarker_code_end', 'InlineMarker_math_start', 'InlineMarker_math_end',
                                'InlineMarker_ref_start', 'InlineMarker_ref_end',
                                // Standard types as fallback
                                'comment', 'string', 'keyword', 'number', 'regexp', 'operator', 'namespace',
                                'type', 'struct', 'class', 'interface', 'enum', 'typeParameter', 'function',
                                'method', 'decorator', 'macro', 'variable', 'parameter', 'property', 'label'
                            ],
                            tokenModifiers: ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification', 'documentation', 'defaultLibrary'],
                            formats: ['relative'],
                            requests: {
                                range: true,
                                full: {
                                    delta: true
                                }
                            }
                        }
                    },
                    workspace: {
                        applyEdit: true,
                        workspaceEdit: {
                            documentChanges: true
                        },
                        didChangeConfiguration: { dynamicRegistration: true },
                        didChangeWatchedFiles: { dynamicRegistration: true },
                        symbol: { dynamicRegistration: true },
                        executeCommand: { dynamicRegistration: true }
                    }
                }
            };

            log.debug('[LspClient] Sending initialize request...');
            console.log('---INIT PARAMS---', JSON.stringify(initParams));
            const result = await this.connection.sendRequest(InitializeRequest.type, initParams);
            log.debug('[LspClient] Initialize result:', result);

            await this.connection.sendNotification(InitializedNotification.type, {});
            log.info('[LspClient] Initialized');

            // Reset retry count on successful connection
            this.retryCount = 0;

            // Listen for diagnostics
            this.connection.onNotification('textDocument/publishDiagnostics', (params: LspPublishDiagnosticsParams) => {
                const uri = monaco.Uri.parse(params.uri);
                const model = monaco.editor.getModel(uri);
                if (model) {
                    const markers: monaco.editor.IMarkerData[] = params.diagnostics.map((d) => ({
                        severity: d.severity === 1 ? monaco.MarkerSeverity.Error :
                                  d.severity === 2 ? monaco.MarkerSeverity.Warning :
                                  d.severity === 3 ? monaco.MarkerSeverity.Info :
                                  monaco.MarkerSeverity.Hint,
                        message: d.message,
                        startLineNumber: d.range.start.line + 1,
                        startColumn: d.range.start.character + 1,
                        endLineNumber: d.range.end.line + 1,
                        endColumn: d.range.end.character + 1,
                        code: d.code ? String(d.code) : undefined,
                        source: d.source
                    }));
                    monaco.editor.setModelMarkers(model, 'lex', markers);
                }
            });

            // Listen for window/showMessage
            this.connection.onNotification('window/showMessage', (params: { type: number, message: string }) => {
                log.debug(`[LSP Message] ${params.message}`);
                // Use a simple alert or console for now, or a toast if available.
                // Since I don't see a toast library imported, I'll use a custom DOM element or just console.warn for visibility.
                // But the user wants a "toast notification".
                // I'll try to use a simple DOM overlay if no library is present.
                
                const typeStr = params.type === 1 ? 'Error' : params.type === 2 ? 'Warning' : 'Info';
                log.info(`[LSP ${typeStr}] ${params.message}`);
                
                // Dispatch a custom event so the UI can react if it wants
                window.dispatchEvent(new CustomEvent('lsp-message', { detail: params }));

                // Also show a simple native notification if possible, or just log.
                // For now, let's create a simple floating div to ensure visibility as requested.
                const toast = document.createElement('div');
                toast.style.position = 'fixed';
                toast.style.bottom = '20px';
                toast.style.right = '20px';
                toast.style.backgroundColor = params.type === 1 ? '#ff4444' : params.type === 2 ? '#ffbb33' : '#33b5e5';
                toast.style.color = 'white';
                toast.style.padding = '10px 20px';
                toast.style.borderRadius = '4px';
                toast.style.zIndex = '10000';
                toast.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
                toast.style.fontFamily = 'sans-serif';
                toast.innerText = params.message;
                document.body.appendChild(toast);
                setTimeout(() => {
                    toast.remove();
                }, 5000);
            });

            this.registerProviders();
        } catch (error) {
            console.error('[LspClient] Initialization failed:', error);
            this.handleConnectionLoss();
            throw error;
        }
    }

    private handleConnectionLoss() {
        if (this.isDisposed) return;

        this.connection = null;
        this.readyPromise = null;

        if (this.retryCount < this.maxRetries) {
            const delay = this.baseRetryDelay * Math.pow(2, this.retryCount);
            log.info(`[LspClient] Reconnecting in ${delay}ms...`);
            this.retryCount++;
            
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
                // TODO: Store rootPath to reuse on reconnection if needed
                this.start().catch(err => log.error('[LspClient] Reconnection failed:', err));
            }, delay);
        } else {
            log.error('[LspClient] Max retries exceeded. Giving up.');
        }
    }

    public dispose() {
        this.isDisposed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.connection) {
            this.connection.dispose();
            this.connection = null;
        }
    }

    private registerProviders() {
        const languageId = 'lex';
        if (!this.connection) return;

        import('./providers/completion').then(m => m.registerCompletionProvider(languageId, this.connection!));
        import('./providers/hover').then(m => m.registerHoverProvider(languageId, this.connection!));
        import('./providers/formatting').then(m => m.registerFormattingProvider(languageId, this.connection!));
        import('./providers/definition').then(m => m.registerDefinitionProvider(languageId, this.connection!));
        import('./providers/semantic_tokens').then(m => m.registerSemanticTokensProvider(languageId, this.connection!));
        import('./providers/code_action').then(m => m.registerCodeActionProvider(languageId, this.connection!));
    }

    public async sendRequest<R, P = unknown>(method: string, params: P): Promise<R> {
        if (!this.readyPromise) {
            this.start();
        }
        await this.readyPromise;
        if (!this.connection) throw new Error('Client not initialized');
        const start = performance.now();
        try {
            const result = await this.connection.sendRequest(method, params) as R;
            const duration = performance.now() - start;
            log.debug(`[LspClient] ${method} responded in ${duration.toFixed(1)}ms`);
            return result as R;
        } catch (error) {
            const duration = performance.now() - start;
            log.error(`[LspClient] ${method} failed after ${duration.toFixed(1)}ms`, error);
            throw error;
        }
    }

    public async onNotification<P = unknown>(method: string, handler: (params: P) => void): Promise<void> {
        if (!this.readyPromise) {
            this.start();
        }
        await this.readyPromise;
        if (!this.connection) {
            console.warn('LSP client not started, cannot register notification handler');
            return;
        }
        this.connection.onNotification(method, handler);
    }

    public async sendNotification<P = unknown>(method: string, params: P): Promise<void> {
        if (!this.readyPromise) {
            this.start();
        }
        await this.readyPromise;
        if (!this.connection) {
            console.warn('LSP client not started, cannot send notification');
            return;
        }
        this.connection.sendNotification(method, params);
    }
}

export const lspClient = new LspClient();
