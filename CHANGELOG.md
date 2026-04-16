# Changelog

## Unreleased

### Breaking

- LSP binary renamed from `lex-lsp` to `lexd-lsp` (matches lex-fmt/lex#450)
- Release artifact names change: `lexd-lsp-{target}.tar.gz`
- `shared/lex-deps.json` key changed from `lex-lsp` to `lexd-lsp`

Updates all references to the renamed binary: electron-builder config, fetch-deps.sh, lsp-manager, QuickLook extension, e2e helpers, and documentation.
