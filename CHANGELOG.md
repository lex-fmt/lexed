# Changelog

## Unreleased

### Breaking

- LSP binary renamed from `lex-lsp` to `lexd-lsp` (matches lex-fmt/lex#450)
- Release artifact names change: `lexd-lsp-{target}.tar.gz`
- `shared/lex-deps.json` key changed from `lex-lsp` to `lexd-lsp`

Updates all references to the renamed binary: electron-builder config, fetch-deps.sh, lsp-manager, QuickLook extension, e2e helpers, and documentation.

### Changed

- Bumped pinned LSP version to v0.8.5 (picks up the table-scoped footnote resolver fix from lex-fmt/lex#460 and the rowspan diagnostic fix from lex-fmt/lex#458).

### Added

- Per-window workspace roots are now persisted across relaunches. A brand-new window picking a folder via File → Open Folder correctly writes its root into the store instead of silently dropping the IPC (previously the write was skipped whenever the window had no pre-existing entry in `openWindows`). Same upsert fix applied to the pane-layout IPC.
- Track a rolling `recentRoots` history in global settings — populated whenever a folder becomes a window's root (explicit open, initial-folder restore, CLI argument, first-launch welcome path). Capped at 20, deduped case-appropriately per-platform.
- OS-opened files now route to the best-matching window instead of always `windows[0]`. Decision order: open window whose root contains the file (longest match, tie-break on focus/recency) → new window with a matching recent root → focused/most-recent open window → new window. Fixes the "file silently doesn't appear" symptom when Finder-opening a file outside the first window's workspace. macOS `open-file` events arriving before the app is ready are queued and dispatched once the router has context.

### Fixed

- `saveWindowState` no longer clobbers fresh window bounds with stale ones (spread order was reversed, so geometry never updated across launches).
- Dev-mode argv parsing no longer misreads the Electron bootstrap argument (`electron .`) as a user-requested workspace folder.
- Cap window restoration at 10 entries on launch. Quit/crash paths could leave orphaned `openWindows` entries in the store; without a cap, a machine used long enough would spawn a growing number of windows on every launch.
- New windows created by OS-file routing seed their initial pane layout into the store before load, so the file reliably appears as a tab instead of racing with renderer-side IPC listener registration.
