# LexEd

Standalone desktop editor for [Lex](https://github.com/lex-fmt/lex) — a plain text format for structured documents.

**[lex.ing](https://lex.ing)** — project site, specs, and documentation.

## Overview

LexEd is an Electron app built with React, TypeScript, and Monaco editor. All language features come from `lexd-lsp` via LSP — no editor-side language logic.

- Monochrome theme (typography and grayscale, adapts to light/dark)
- Multi-pane editing with split views
- Export to Markdown, HTML, PDF
- Command palette (`Cmd+K`)

## Install

Download from [GitHub Releases](https://github.com/lex-fmt/lexed/releases) or build from source:

```sh
npm ci
npm run dev        # development
npm run build      # production build
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+]` / `[` | Cycle through tabs |
| `Cmd+1`…`9` | Focus pane by position |
| `Cmd+K` | Command palette |
| `Cmd+R` | Find and replace |
| `Cmd+Shift+H` | Split horizontal |
| `Cmd+Shift+V` | Split vertical |
| `Cmd+Shift+/` | Shortcuts reference |

On Windows/Linux, `Cmd` maps to `Ctrl` and `Option` to `Alt`.

## Development

See `README.lex` for architecture details (platform abstraction, LSP transport, semantic highlighting).

```sh
npm run test:e2e   # Playwright e2e suite
```

## License

MIT
