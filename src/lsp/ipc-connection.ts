import { AbstractMessageReader, AbstractMessageWriter, Message, Disposable, DataCallback } from 'vscode-jsonrpc';

interface IpcRenderer {
    send(channel: string, ...args: unknown[]): void;
    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
    off(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

export class IpcMessageReader extends AbstractMessageReader {
    private ipcRenderer: IpcRenderer;
    private buffer: Uint8Array = new Uint8Array(0);
    private callback: DataCallback | null = null;

    constructor(ipcRenderer: IpcRenderer) {
        super();
        this.ipcRenderer = ipcRenderer;
    }

    listen(callback: DataCallback): Disposable {
        this.callback = callback;
        const listener = (_event: unknown, data: unknown) => {
            if (data instanceof Uint8Array) {
                this.appendBuffer(data);
                this.processBuffer();
            }
        };

        this.ipcRenderer.on('lsp-output', listener);
        return Disposable.create(() => {
            this.ipcRenderer.off('lsp-output', listener);
            this.callback = null;
        });
    }

    private appendBuffer(data: Uint8Array) {
        const newBuffer = new Uint8Array(this.buffer.length + data.length);
        newBuffer.set(this.buffer);
        newBuffer.set(data, this.buffer.length);
        this.buffer = newBuffer;
    }

    private processBuffer() {
        let shouldContinue = true;
        while (shouldContinue) {
            shouldContinue = this.tryProcessMessage();
        }
    }

    private tryProcessMessage(): boolean {
        const headerEndIndex = this.findHeaderEnd(this.buffer);
        if (headerEndIndex === -1) {
            return false;
        }

        const headerBytes = this.buffer.slice(0, headerEndIndex);
        const headerString = new TextDecoder().decode(headerBytes);
        const match = headerString.match(/Content-Length: (\d+)/);

        if (!match) {
            console.error('Invalid LSP header, discarding:', headerString);
            this.buffer = this.buffer.slice(headerEndIndex);
            return this.buffer.length > 0;
        }

        const contentLength = parseInt(match[1], 10);
        const totalLength = headerEndIndex + contentLength;
        if (this.buffer.length < totalLength) {
            return false;
        }

        const bodyBytes = this.buffer.slice(headerEndIndex, totalLength);
        this.buffer = this.buffer.slice(totalLength);

        try {
            const bodyString = new TextDecoder().decode(bodyBytes);
            const message = JSON.parse(bodyString) as Message;
            if (this.callback) {
                this.callback(message);
            }
        } catch (error) {
            this.fireError(error);
        }

        return this.buffer.length > 0;
    }

    private findHeaderEnd(buffer: Uint8Array): number {
        for (let i = 0; i < buffer.length - 3; i++) {
            if (buffer[i] === 13 && buffer[i + 1] === 10 && buffer[i + 2] === 13 && buffer[i + 3] === 10) {
                return i + 4;
            }
        }
        return -1;
    }
}

export class IpcMessageWriter extends AbstractMessageWriter {
    private ipcRenderer: IpcRenderer;

    constructor(ipcRenderer: IpcRenderer) {
        super();
        this.ipcRenderer = ipcRenderer;
    }

    async write(msg: Message): Promise<void> {
        const json = JSON.stringify(msg);
        const encoder = new TextEncoder();
        const encoded = encoder.encode(json);
        const payload = `Content-Length: ${encoded.length}\r\n\r\n${json}`;
        this.ipcRenderer.send('lsp-input', payload);
    }

    end(): void {
        // No-op for IPC
    }
}
