---
name: lexed-development
description: |
  Guide for working with the LexEd Electron desktop editor. Use when:
  (1) Building or packaging the LexEd application
  (2) Adding features to the Electron main or renderer process
  (3) Working with the LSP integration or Monaco editor
  (4) Testing LexEd with e2e or unit tests
  (5) Understanding the project structure and build system
---

# LexEd Development Guide

## Project Structure

```
lexed/
├── electron/           # Main process code
│   ├── main.ts         # App entry, window management, IPC handlers
│   ├── preload.ts      # Context-isolated APIs for renderer
│   ├── window-manager.ts  # Window lifecycle and settings
│   └── lsp-manager.ts  # Language server process management
├── src/                # Renderer process (React)
│   ├── components/     # React components
│   ├── lsp/            # LSP client and providers
│   └── App.tsx         # Main React component
├── shared/             # Shared types (main ↔ renderer)
├── bin/                # CLI script for macOS
├── quicklook/          # macOS QuickLook extension (Swift)
├── scripts/            # Build scripts
├── tests/              # e2e and fixtures
├── welcome/            # First-launch welcome document
└── dictionaries/       # Spellcheck dictionaries
```

## Build System

**Stack**: Vite + electron-builder + React + TypeScript + Tailwind CSS

### Build Commands

```bash
npm run dev          # Development with hot reload
npm run build        # Full production build (icons + quicklook + app + DMG)
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run format       # Prettier
```

### Build Pipeline

1. `npm run prebuild` runs automatically before build:
   - `npm run icons` - Generate .icns (macOS) and .ico (Windows) from PNGs
   - `npm run build:quicklook` - Build QuickLook extension (macOS only)

2. `npm run build` executes:
   - `scripts/fetch-deps.sh` - Download lex-lsp binary from GitHub releases
   - `tsc` - TypeScript compilation
   - `vite build` - Bundle renderer, main, and preload
   - `electron-builder` - Package into DMG/installer

## LSP Integration

### Binary Resolution (in order)
1. `LEX_LSP_PATH` environment variable (for local dev)
2. Bundled binary in `resources/lex-lsp` (production)

### Development with Local LSP
```bash
# Build lex-lsp from the lex repo
cd /path/to/lex && cargo build -p lex-lsp

# Run lexed with local LSP
LEX_LSP_PATH=/path/to/lex/target/debug/lex-lsp npm run dev:local
```

## Testing

### E2E Tests (Playwright)
```bash
npm run test:e2e           # Full e2e with fresh build
npm run test:e2e:dev       # E2e against dev server (faster)
npm run test:e2e:built     # E2e against built app
```

### Unit Tests (Vitest)
```bash
npm run test:unit          # Run unit tests
```

### Test Environment Variables
- `LEX_DISABLE_PERSISTENCE=1` - Disable settings persistence
- `LEX_DISABLE_SINGLE_INSTANCE_LOCK=1` - Allow multiple instances
- `LEX_HIDE_WINDOW=1` - Hide window during tests
- `LEX_TEST_FIXTURES` - Override fixtures directory

## macOS-Specific Features

### QuickLook Extension
- Location: `quicklook/LexQuickLook.xcodeproj`
- Built with xcodebuild, output to `build/quicklook/`
- Bundled into `LexEd.app/Contents/PlugIns/`

### CLI Tool (`lexed` command)
- Source: `bin/lexed` (shell script)
- Bundled to: `LexEd.app/Contents/Resources/bin/lexed`
- Install via: Shell menu → "Install 'lexed' command in PATH"

## IPC Communication

### Main → Renderer Events
- `open-file-path` - Open file in editor
- `open-folder-path` - Set workspace folder
- `menu-*` - Menu command triggers
- `settings-changed` - Settings updated

### Renderer → Main Handlers
- `file-new`, `file-open`, `file-save`, `file-read`
- `folder-open`, `get-initial-folder`, `set-last-folder`
- `get-open-tabs`, `set-open-tabs`
- `get-app-settings`, `set-*-settings`

## Adding Features

### Main Process (electron/main.ts)
1. Add IPC handler with `ipcMain.handle()` or `ipcMain.on()`
2. Update preload.ts to expose via `contextBridge`
3. Add types to shared/ for type safety

### Renderer Features
1. Components go in `src/components/`
2. LSP features in `src/lsp/providers/`
3. Use `window.electronAPI.*` for IPC calls

## Debugging

### Logs
- File: `~/Library/Logs/LexEd/lexed.log`
- Console: Set `LEX_LOG_CONSOLE_LEVEL=debug`

### DevTools
- Menu: View → Toggle DevTools
- Or: `Cmd+Option+I`

### Environment Variables
- `LEX_LOG_LEVEL` - File log level
- `LEX_LOG_CONSOLE_LEVEL` - Console log level
- `NODE_ENV=development` - Development mode
