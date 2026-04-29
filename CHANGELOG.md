# Changelog

## Unreleased

## v0.6.7 (2026-04-25)

### Fixed

- Windows release builds were failing in 7-Zip when packaging the bundled welcome doc. Root cause was the `welcome/welcome-to-lex.lex` git symlink — Windows checkout left it as an unresolvable pointer and 7za bailed with "directory name is invalid". The welcome file is now a real (non-symlink) copy of `general.lex` at `welcome/welcome-to-lex.lexd`. Renaming the extension on its own (v0.6.6) was not sufficient. (#28)
- macOS Intel (x64) was silently mis-built: the `macos-x64` matrix entry ran on `macos-15` (Apple-silicon hardware) and produced an arm64 DMG that clobbered the real arm64 DMG on upload. The `macos-x64` entry is removed; releases now ship a single Apple-silicon DMG. (#29)
- `latest-mac.yml` is uploaded inline with the macOS build instead of via a separate merge job (the merge job existed only to combine two arches; with one arch it could be skipped if any other matrix entry failed).
- Bumped `package.json` version so DMG filenames reflect the tag (was stuck at `0.6.2` since the QuickLook re-sign step reads the version from `package.json`).

### Added

- `.lexd` is recognized as a Lex extension throughout the editor (Monaco language, file associations, file tree, tab icon, CLI/`open-file` routing), in preparation for the project-wide rename to `lexd`. Existing `.lex` files keep working unchanged.

## v0.6.6 (2026-04-25)

Botched release: Windows asset is corrupt (7za failed mid-zip but the partial file was uploaded), `latest-mac.yml` missing, no NSIS installer. Use v0.6.7 instead.

## v0.6.5 (2026-04-24)

### Breaking

- LSP binary renamed from `lex-lsp` to `lexd-lsp` (matches lex-fmt/lex#450)
- Release artifact names change: `lexd-lsp-{target}.tar.gz`
- `shared/lex-deps.json` key changed from `lex-lsp` to `lexd-lsp`

Updates all references to the renamed binary: electron-builder config, fetch-deps.sh, lsp-manager, QuickLook extension, e2e helpers, and documentation.

### Changed

- Bumped pinned LSP version to v0.8.7 (picks up table-scoped footnote resolver fix from lex-fmt/lex#460, rowspan diagnostic fix from lex-fmt/lex#458, and the comms v0.14.0 spec content).
- Bumped pinned tree-sitter grammar to v0.9.1 (new `[::label]` annotation reference syntax and directly-nested inline formatting markers).
- Spellcheck engine swapped from `nspell` (pure-JS Hunspell port, eager affix expansion) to `cspell-trie-lib` (precompiled trie, lazy lookup). Per-language `.trie.gz` artifacts are built offline from the Hunspell source + the tech-vocab supplement and committed to `dictionaries/`. Measured startup for the worst case (pt_BR, 4+ MB source, 312k entries) went from >60 s of blocked renderer to 317 ms of trie parse; lookups are now O(word length) at ~0.3 µs each. Suggestions are still similar-cost to before (~50–250 ms). Unblocks non-English developers (French, Italian, Portuguese, Polish, Russian locales were effectively unusable before) and removes the `deferUntilLspReady` gate that was working around the freeze.
- Dictionary layout: Hunspell sources moved to `dictionaries/source/` (build-input only, not shipped). Runtime resources are `dictionaries/*.trie.gz` + `dictionaries/licenses/`. Shipped bundle size drops ~13 MB (no more 20 MB of `.aff`/`.dic` sources, 7.9 MB of tries instead). New split npm scripts: `supplement:update|check` (regenerates `source/supplement.txt` from cspell-dicts), `tries:update|check` (compiles `.trie.gz` from sources+supplement), and `dictionaries:update|check` which chains both.
- Spellcheck word extraction now treats `-` as a word boundary (like whitespace), so hyphenated tokens in grammar/spec documents (`table-row`, `subject-line`…) are checked part-by-part against the dictionary instead of looked up as compounds the en_US Hunspell build doesn't carry.
- "Add to dictionary" fans out plain lowercase or Title-case input to both forms, so adding `potato` also recognizes `Potato` at sentence starts. ALL-CAPS acronyms and camelCase brand names (NASA, iPhone, GitHub) are kept verbatim.
- Custom dictionary (user "Add to dictionary" words) is stored under `userData/custom.dic` in both dev and production. Previously dev builds wrote into the repo's `dictionaries/custom.dic`, which leaked personal vocabulary into commits and cross-contaminated e2e test runs.

### Added

- Per-window workspace roots are now persisted across relaunches. A brand-new window picking a folder via File → Open Folder correctly writes its root into the store instead of silently dropping the IPC (previously the write was skipped whenever the window had no pre-existing entry in `openWindows`). Same upsert fix applied to the pane-layout IPC.
- Track a rolling `recentRoots` history in global settings — populated whenever a folder becomes a window's root (explicit open, initial-folder restore, CLI argument, first-launch welcome path). Capped at 20, deduped case-appropriately per-platform.
- OS-opened files now route to the best-matching window instead of always `windows[0]`. Decision order: open window whose root contains the file (longest match, tie-break on focus/recency) → new window with a matching recent root → focused/most-recent open window → new window. Fixes the "file silently doesn't appear" symptom when Finder-opening a file outside the first window's workspace. macOS `open-file` events arriving before the app is ready are queued and dispatched once the router has context.
- Shared tech-vocabulary spellcheck supplement (`dictionaries/supplement.dic`, ~9k entries) layered on top of every Hunspell locale. The bundled SCOWL size=60 dictionaries miss a lot of modern technical vocabulary (`lifecycle`, `amd64`, `stdin`, `csrf`, `oauth`, `webhook`, …); the supplement is generated from streetsidesoftware/cspell-dicts (MIT, pinned commit) plus a hand-curated gap list, sourced by `scripts/generate-dictionary-supplement.py`. Cached via a stamp file so normal runs are no-ops; npm scripts `dictionaries:update`, `dictionaries:update:force`, and `dictionaries:check` drive it. Upstream LICENSE text is vendored under `dictionaries/licenses/`.

### Fixed

- `saveWindowState` no longer clobbers fresh window bounds with stale ones (spread order was reversed, so geometry never updated across launches).
- Dev-mode argv parsing no longer misreads the Electron bootstrap argument (`electron .`) as a user-requested workspace folder.
- Cap window restoration at 10 entries on launch. Quit/crash paths could leave orphaned `openWindows` entries in the store; without a cap, a machine used long enough would spawn a growing number of windows on every launch.
- New windows created by OS-file routing seed their initial pane layout into the store before load, so the file reliably appears as a tab instead of racing with renderer-side IPC listener registration.
- Spellcheck init no longer blocks the LSP handshake. `nspell()` parses the whole `.dic` synchronously on construction, so large locales (pt_BR is 4+ MB, ru_RU similar) could starve the LSP `InitializeResponse` handler and leave `window.__lexLspReady` permanently false. Spellcheck now waits for the `lexed:lsp-ready` event before starting the parse (with a 10s fallback if LSP never comes up). Symptom was every e2e test timing out at 15s for developers whose persisted spellcheck language was non-English.
- e2e tests now launch each Electron instance against a fresh temporary `userData` directory (new `E2E_USER_DATA_DIR` env var honored by the main process before `electron-store` initializes). Previously tests read the developer's real persisted settings, so machine-dependent state (spellcheck language, open tabs, recent roots) silently influenced test behavior. Tests that need cross-launch persistence (file-routing) can still supply their own dir.
