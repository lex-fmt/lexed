<!-- generated - do not edit. See CHANGELOG/README.txt -->

# Changelog

## Unreleased

## 0.11.1 - 2026-06-16

- Build fails fast with an actionable message when fetched resources are missing, instead of failing deep inside `vite build` (#152)
- Add unit tests for lib/files file-type detection and file-action enablement (#153)
- ci: migrate release reusable-workflow callers from @v2 to @v3

## 0.11.0 - 2026-06-03

Fix macOS and Windows release builds (#142). macOS: bundle only `bin/lexed` in app Resources instead of the whole `bin/` dir, which after the symlink migration shipped dangling links that aborted electron-builder. Windows: resource fetch (`fetch-deps`) CRLF bug fixed upstream so tree-sitter wasm + queries land correctly.
Smart paste: route pastes into .lex buffers through the language server's lex/preparePaste request, re-anchoring pasted blocks to the caret's structural indentation level (#136). Guarded on the server capability; falls back to native paste against older servers. Bumps lexd-lsp to v0.17.0.

## 0.10.7 - 2026-06-01

- Migrate changelog handling to the fragment-directory model
  (arthur-debert/release#201). Future entries go in
  CHANGELOG/unreleased-`<slug>`.md fragments via `bin/changelog add`.


## v0.10.7 (2026-05-24)

### Changed

- CI: adopted the canonical `e2e: true` input on
  `arthur-debert/release/.github/workflows/electron-ci.yml@v1`
  (see arthur-debert/release#185). The previously bespoke `e2e` job
  in `.github/workflows/test.yml` is gone; the e2e gate now runs
  via the reusable workflow's dedicated e2e job. lexed-specific
  orchestration (lex-lsp fetch, tree-sitter download, embedded
  grammars) moves to the canonical's `pre-test` input; the
  packaged-build + xvfb wrapping lives in a new `test:e2e:ci` npm
  script.

## [0.10.6] - 2026-05-22


### Fixed

- `scripts/smoke.sh`: bash 3.2-safe expansion of `SMOKE_PREFIX[@]` so
  the mac smoke step (system `/bin/bash` 3.2 under `set -u`) doesn't
  error when the array is empty.
- `scripts/gen-theme.py`: replaced the `✓` glyph with ASCII `OK` so
  Windows runners' cp1252 stdout doesn't fail the `theme:check` step.
## [0.10.5] - 2026-05-22


### Changed

- Adopted the canonical `bin/build` from the `electron-app` release
  stack (`arthur-debert/release#160`). The release workflow now invokes
  `bin/build` instead of `npm run build` directly, matching the
  per-stack convention across the rest of the ecosystem.
- Migrated `on-upstream-released.yml` to the canonical
  `cascade-handler@v1` reusable workflow.

### Removed

- Removed the bespoke `dependabot-auto-merge.yml`; the canonical
  Dependabot auto-merge policy is delivered via repo ruleset.
## [0.10.4] - 2026-05-21


### Changed

- Spell-check policy aligned with `tree-sitter-lex@v0.11.0`: the block
  detection in `src/spellcheck/word-extraction.ts` is now a two-pass
  state machine that distinguishes verbatim blocks (subject + body + `::
  lang ::` closer; body suppressed) from annotation blocks (`:: label ::`
  opener + body + `::` closer; body spell-checked). Trailing descriptors
  on `:: label :: <text>` are spell-checked; the label prefix is not.
  Math span delimiter switched from `$…$` → `#…#` to match the lex
  grammar. Indent handling now correctly accounts for spaces (4 = 1
  indent stop) and tabs per `welcome/general.lex` §2, fixing a latent
  bug where space-indented documents had broken subject/body detection.
- `tree-sitter` pin bumped to `v0.11.0`.

### Added

- `src/spellcheck/__tests__/spellcheck-fixture.test.ts` — fixture-based
  e2e tests over the canonical fixture mirrored from `tree-sitter-lex`,
  asserting prose typos surface and non-prose typos stay hidden across
  titles, paragraphs, table cells, verbatim subjects, annotation
  bodies, trailing descriptors, code spans, math spans, and references.

## v0.10.3 (2026-05-21)

### Changed

- Add `## [Unreleased]` Keep-a-Changelog section so the canonical
  `arthur-debert/release/.github/workflows/electron-app.yml@v1`
  release pipeline (called via `release.yml`) can clear its
  `prepare-release-npm` pre-flight, which expects this format. No
  product-facing changes in this entry — it unblocks the first
  end-to-end validation run of the canonical release workflow
  against lexed.

## v0.10.2 (2026-05-18)

## v0.10.1 (2026-05-17)

## v0.10.0 (2026-05-13)

### Added

- **Extract Selection to Include File**
  ([lex#498](https://github.com/lex-fmt/lex/issues/498)). Visually
  select a section, hit `cmd+shift+e`, and a modal prompts for the
  target include path; lexed splits the selection out into a new
  file and replaces the host range with
  `:: lex.include src="…" ::`. All path validation
  (URL-scheme / root-escape / existing-target / missing-parent-dir)
  + indent-shifting + parse pre-check happens server-side in
  [lex v0.12.0](https://github.com/lex-fmt/lex/releases/tag/v0.12.0);
  this PR adds the editor-side wiring: `extractToInclude` feature,
  `ExtractToIncludeModal` component, `editor.extractToInclude`
  keybinding action. Validation errors surface in the existing toast
  notification surface carrying the typed `ExtractError` message
  verbatim.

### Changed

- Bumps `lexd-lsp` pin v0.11.0 → v0.12.0.
- The WorkspaceEdit applier walks `documentChanges` by hand instead
  of delegating to a generic LSP apply path: each `CreateFile`
  target's content is written via the `file-save` IPC, and the
  host-side `TextDocumentEdit` lands as a Monaco
  `editor.executeEdits` call. The split is needed because both
  vscode's `applyEdit` and the equivalent paths in other editors
  silently no-op a `TextDocumentEdit` targeted at a freshly-
  `CreateFile`'d URI (the buffer isn't loaded as a document).

### Fixed

- `fsPathFromUri` correctly handles Windows file URIs
  (`file:///C:/Users/foo` → `C:/Users/foo`) by stripping the leading
  slash before a drive-letter prefix; previously this path was
  passed to `fs.writeFile` with the leading slash and would fail.
- Defensive shape check on new-file content edits: the applier
  asserts a single edit at `(0,0)-(0,0)` and throws clearly if the
  server ever changes the contract. The old `op.edits.map(...).join('')`
  silently dropped range / ordering information.

## v0.9.0 (2026-05-10)

### Added

- Extension trust prompt. When `lexd-lsp` boots a workspace with a
  `[labels]` namespace whose subprocess handler hasn't been pinned in
  `<workspace>/.lex/trust.json`, the server fires a `lex/trustRequest`
  custom request and lexed renders a modal **Trust** / **Deny**
  dialog showing the namespace name, schema source, command string,
  and declared capability set. The user's reply is fed back to the
  trust gate and pinned for subsequent sessions. Click-outside / Esc
  treats the prompt as denied (fail-closed). Pairs with `lexd-lsp`
  v0.11+ which adds the trust-request forwarding (lex-fmt/lex#549).
  Part of the γ phase of the extension system (lex-fmt/lex#516).

### Changed

- `@lex-fmt/lex-buffer`: `LspClient` gains `onRequest(method, handler)`
  for registering server→client custom request handlers (mirror of the
  existing `onNotification`). Used by the trust-prompt wiring above.
- Bumped `lexd-lsp` pin from v0.10.6 to v0.11.0. Picks up the
  extension dispatch + trust-prompt forwarding + boot-serialization
  wiring this app's trust-prompt handler depends on. See lex-fmt/lex
  CHANGELOG `[0.11.0]` for the full surface.

### Tests

- New Playwright e2e spec (`tests/e2e/trust-prompt.spec.ts`) covering
  the `lex/trustRequest` modal end-to-end via the e2e bridge:
  injects a fake trust request through `window.__e2e.bridge.injectTrustRequest`,
  asserts the modal renders with the namespace, command, and
  capability labels visible, and verifies clicking Trust → trusted,
  Deny → denied with a named reason, Esc → denied + dismissed
  (fail-closed). The bridge helper is added to `useLexTestBridge`.

## v0.8.2 (2026-05-07)

### Changed

- Bumped `lexd-lsp` pin from v0.10.5 to v0.10.6. Picks up the LSP
  position UTF-16 column fix: inline tokens (the Monaco highlighter
  for `*bold*`, `_italic_`, `` `code` ``, `[ref]`) and
  goto-definition / find-references targets now land on the correct
  character even when the line contains non-ASCII characters like
  `→`. Previously the open marker of an inline code span on a line
  like ``Provision → `Setup` → `PathExport`...`` rendered on the
  *next* glyph (the `e` of `Setup` instead of the `` ` ``), shifting
  the inline-code styling one character right of where it should be.
- Bumped `comms` submodule pin to v0.16.1 and regenerated
  `packages/lex-buffer/src/monaco/theme-data.ts`. Reference inlines
  (`Reference`, `ReferenceCitation`, `ReferenceFootnote`,
  `ReferenceAnnotation`) now render with **bold** instead of
  underline. Underline reads as "follow this link" and conflicted
  with the LSP `documentLink` decoration that the editor reserves
  for actually-clickable URL/file targets; bold matches the way
  references read in printed text.

## v0.8.1 (2026-05-07)

### Changed

- Bumped `lexd-lsp` pin from v0.10.0 to v0.10.5. Headline fixes for the
  document-link surface that Monaco renders as the clickable region for
  `[bracketed]` references:
  - The link range is now scoped to the bracketed reference itself; a
    paragraph containing a URL or file reference no longer renders end-to-end
    as one clickable link.
  - References that appear in a section heading (e.g.
    `1. See [./handlers.lex] for details`) now also contribute clickable
    links — previously the LSP silently dropped them from the
    `documentLink` response.
- Also includes everything else from v0.10.1 through v0.10.5: the
  `include-not-found` diagnostic now points at the offending
  `lex.include` annotation instead of the document head, and `FsLoader`
  picked up symlink-traversal defenses, resource limits
  (`max_total_includes`, `max_file_size`), and rejection of
  platform-absolute include paths. The absolute-path rejection is a
  behavior change for documents that contained
  `:: lex.include src="C:\path\to\file" ::` style annotations — those
  now error up front with a clear "absolute path not allowed" message
  via `IncludeError::AbsolutePath` instead of being caught downstream
  by the root-escape check with a misleading error. The supported
  forms are unchanged (relative paths and root-absolute `/path` against
  the configured includes root).

## v0.8.0 (2026-05-04)

### Changed

- Bumped `lexd-lsp` pin from v0.8.8 to v0.10.0. Adds the `lex.include` annotation surface in the editor: real-time include diagnostics (broken paths, cycles, depth-exceeded, root-escape, container-policy violations, etc.) on every edit, goto-definition that jumps from `:: lex.include src="chapter.lex" ::` into the target file, and a hover preview that shows the resolved path plus the first non-blank lines of the target. No editor-side configuration required — the LSP handles include resolution from the host's `[includes]` config (with sensible defaults).
- Bumped `comms` submodule to v0.16.0 (canonical `lex.include` element doc + fixture set + formal reservation of the `lex.*` annotation namespace).

## v0.7.1 (2026-05-02)

### Changed

- Monaco syntax-highlighting palette and token rules are now generated from `comms/shared/theming/lex-theme.json` (the cross-editor canonical source) via `scripts/gen-theme.py` → `src/monaco/theme-data.ts`. `theme:check` runs in `pretypecheck`/`prebuild` so stale generated output fails CI. Picks up four canonicalization fixes in the process: `DocumentTitle` gains underline, `DocumentSubtitle` and `ReferenceAnnotation` are now declared, `VerbatimContent` gets the `code_bg` background. (#68)
- Theme colors are now resolved at generate time, matching the strategy already used by vscode and zed: `theme-data.ts` exports per-mode `PALETTE` and `RULES` with absolute hex values pre-resolved from the canonical intensity/background tiers. Removed the runtime CSS-variable resolution path from `src/monaco/theme.ts` — the `--monaco-color-*` variables it tried to read were never defined anywhere in the codebase, so `FALLBACK_PALETTES` was always the effective source. The `Intensity`/`BackgroundKey` types and the hidden-probe-div machinery are gone with it. (#71)
- Bumped `comms` submodule to v0.15.0 (canonical Lex monochrome theme + EDITORS.lex parity reference + `:: notes ::` annotation samples).
- Bumped `tree-sitter` pin from v0.10.0 to v0.10.1 in `shared/lex-deps.json`. Picks up the comms catch-up and the new quarterly grammar-bump workflow; tree-sitter v0.10.1 is a CI/comms patch with no grammar changes.
- Repo onboarded to the canonical lex-fmt CI standardization: `.github/CODEOWNERS`, `.github/workflows/copilot-review.yml`, dependabot config grouping + auto-merge for patch/minor, and a `gh pr merge --auto` retry to handle the CI-race timing window. (#33, #34, #51, #67)

### Fixed

- macOS Electron e2e tests: bundle the main process as CommonJS to unblock e2e test runs that broke after the Electron upgrade. (#70)
- macOS dock icon: hidden when `E2E_HIDE_WINDOW=1` so e2e test runs don't pollute the dock. (#35)

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
