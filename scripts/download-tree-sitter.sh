#!/usr/bin/env bash
set -euo pipefail

# Downloads tree-sitter artifact (lex grammar WASM + queries + embedded
# grammars manifest) from GitHub releases. The web-tree-sitter runtime
# WASM is copied out of node_modules at build time (see
# scripts/copy-tree-sitter-runtime.mjs).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$APP_DIR/resources"
VERSION_STAMP="$RESOURCES_DIR/.tree-sitter-version"

IF_MISSING=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --if-missing) IF_MISSING=true; shift ;;
    -h|--help)
      echo "Usage: $(basename "$0") [--if-missing]"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

TS_VERSION="$(node "$SCRIPT_DIR/read-lex-config.mjs" tree-sitter version)"
TS_REPO="$(node "$SCRIPT_DIR/read-lex-config.mjs" tree-sitter repo)"

# Tracks the version of the cached artifacts. Without this, bumping the
# pin in shared/lex-deps.json silently leaves an old wasm in place; the
# query files get refreshed via other paths and start referencing node
# names the stale grammar doesn't define ("Bad node name X" at startup).
artifacts_match_pinned_version() {
  [[ -f "$RESOURCES_DIR/tree-sitter-lex.wasm" ]] \
    && [[ -d "$RESOURCES_DIR/queries" ]] \
    && [[ -f "$RESOURCES_DIR/embedded-grammars.json" ]] \
    && [[ -f "$VERSION_STAMP" ]] \
    && [[ "$(cat "$VERSION_STAMP")" == "$TS_VERSION" ]]
}

download_tree_sitter() {
  if $IF_MISSING && artifacts_match_pinned_version; then
    echo "tree-sitter $TS_VERSION already installed at $RESOURCES_DIR, skipping"
    return 0
  fi

  echo "Downloading tree-sitter $TS_VERSION..."

  local download_url="https://github.com/$TS_REPO/releases/download/$TS_VERSION/tree-sitter.tar.gz"
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  local archive_path="$tmp_dir/tree-sitter.tar.gz"

  local curl_opts=(-fsSL -o "$archive_path")
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    curl_opts+=(-H "Authorization: Bearer $GITHUB_TOKEN")
  fi

  if ! curl "${curl_opts[@]}" "$download_url"; then
    echo "Failed to download $download_url" >&2
    rm -rf "$tmp_dir"
    exit 1
  fi

  mkdir -p "$tmp_dir/extracted"
  tar -xzf "$archive_path" -C "$tmp_dir/extracted"

  mkdir -p "$RESOURCES_DIR/queries"
  rm -f "$RESOURCES_DIR/queries/"*.scm
  cp "$tmp_dir/extracted/tree-sitter-lex.wasm" "$RESOURCES_DIR/tree-sitter-lex.wasm"
  cp "$tmp_dir/extracted/queries/"*.scm "$RESOURCES_DIR/queries/"

  # Pull the cross-editor embedded-grammars manifest out of the tarball.
  # download-embedded-grammars.sh reads this file to decide which third-
  # party grammars to fetch — pinning tree-sitter-lex pins the manifest
  # in lockstep, so vscode and lexed share one curated list.
  if [[ -f "$tmp_dir/extracted/shared/embedded-grammars.json" ]]; then
    cp "$tmp_dir/extracted/shared/embedded-grammars.json" "$RESOURCES_DIR/embedded-grammars.json"
  else
    echo "Warning: tree-sitter $TS_VERSION did not ship shared/embedded-grammars.json" >&2
    rm -f "$RESOURCES_DIR/embedded-grammars.json"
  fi

  printf '%s' "$TS_VERSION" > "$VERSION_STAMP"

  rm -rf "$tmp_dir"
  echo "tree-sitter $TS_VERSION → $RESOURCES_DIR"
}

mkdir -p "$RESOURCES_DIR"
download_tree_sitter
