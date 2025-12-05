Lex LexEd Architecture

    This document outlines the architecture of the Lex LexEd application and the integration with the Rust-based Language Server Protocol (LSP).

1. Architecture Overview

    The Lex LexEd application is built using a modern web technology stack wrapped in Electron, communicating with a high-performance Rust backend.

    1. Frontend (Renderer Process)

        Built with React, TypeScript, and Vite.

        Uses `monaco-editor` for the core editing experience.

        Manages the UI state, file handling via IPC, and renders the editor, sidebar, and panels.

    2. Backend (Main Process)

        Built with Electron (Node.js).

        Manages application lifecycle, native file system access, and window management.

        Spawns and manages the `lex-lsp` binary as a child process.

        Acts as a bridge between the Renderer and the LSP, forwarding JSON-RPC messages.

    3. Language Server (Rust)

        The `lex-lsp` binary, written in Rust.

        Provides language intelligence: diagnostics, document symbols (outline), hover information, and semantic tokens.

        Communicates via standard input/output (stdio) using the Language Server Protocol.

2. LSP Communications

    The communication between the Monaco editor and the Rust LSP server involves a multi-hop message passing system.

    1. Renderer to Main

        The `LspClient` in the renderer sends a JSON-RPC message (e.g., `textDocument/didChange`) via Electron IPC channel `lsp-input`.

    2. Main to LSP

        The Main process listens on `lsp-input`, prepends the required `Content-Length` header, and writes the data to the `lex-lsp` process's standard input (stdin).

    3. LSP Processing

        The `lex-lsp` binary reads from stdin, parses the message, processes the request (e.g., parsing the Lex document, generating tokens), and writes the response to standard output (stdout).

    4. LSP to Main

        The Main process captures the `lex-lsp` stdout stream.

    5. Main to Renderer

        The Main process forwards the raw data buffer to the renderer via Electron IPC channel `lsp-output`.

    6. Renderer Processing

        The `LspClient` buffers the incoming data, parses the `Content-Length` header, extracts the JSON body, and resolves the pending request or triggers a notification handler.

3. Semantic Highlighting

    Syntax highlighting in Lex LexEd uses the LSP's semantic tokens capability for rich, accurate highlighting.

    1. Provider Registration

        The `Editor.tsx` component registers a `DocumentSemanticTokensProvider` with Monaco *before* the editor is created.

        This ensures Monaco queries the provider when the model is attached.

        The provider uses a static legend matching the LSP server's token types (e.g., `SessionTitleText`, `ListMarker`, `InlineStrong`).

    2. Token Flow

        When Monaco needs semantic tokens, it calls `provideDocumentSemanticTokens`.

        The provider sends a `textDocument/semanticTokens/full` request to the LSP via the `LspClient`.

        The LSP returns an encoded token array (5 integers per token: deltaLine, deltaStartChar, length, tokenType, tokenModifiers).

        The provider wraps this in a `Uint32Array` and returns it to Monaco.

    3. Initialization Sequence

        The semantic tokens provider is registered immediately with empty responses until the LSP is ready.

        After LSP initialization, the `lspReady` flag is set to true.

        A model value refresh is triggered to force Monaco to re-query tokens.

4. Visual Style

    The editor uses the Lex Monochrome Theme.

    Instead of colorful syntax highlighting, it relies on grayscale intensity and typography:

    - Normal (full contrast): Session Titles, body text, inline formatting (strong, emphasis, code).
    - Muted (medium gray): Structural elements like markers and references.
    - Faint (light gray): Meta-information like annotations and verbatim metadata.
    - Faintest (barely visible): Inline markers (*, _, `, [, ]).

    Typography is used for emphasis:
    - Bold: Session Titles, strong text.
    - Italic: Markers, definitions, emphasis.
    - Underline: References.

    This aligns with the design philosophy of Lex as a distraction-free, prose-focused format.

## Testing

- Run `npm run test:e2e` inside `editors/lexed/` to execute the Playwright e2e suite (builds the app before running).

Running `npm run test:e2e` hides the Electron window via `LEX_HIDE_WINDOW=1` so tests do not steal focus; unset it to observe the UI.
