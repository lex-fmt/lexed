# Changelog

## Unreleased

### Breaking

- LSP binary renamed from `lex-lsp` to `lexd-lsp` (matches lex-fmt/lex#450)
- Release artifact names change: `lexd-lsp-{target}.tar.gz`
- `shared/lex-deps.json` key changed from `lex-lsp` to `lexd-lsp`

Updates all references to the renamed binary: electron-builder config, fetch-deps.sh, lsp-manager, QuickLook extension, e2e helpers, and documentation.

### Changed

- Bumped pinned LSP version to v0.8.5 (picks up the table-scoped footnote resolver fix from lex-fmt/lex#460 and the rowspan diagnostic fix from lex-fmt/lex#458).
