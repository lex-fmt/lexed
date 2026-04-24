#!/usr/bin/env bash
set -euo pipefail

# Downloads tree-sitter artifact (lex grammar WASM + queries) from GitHub releases.
# The web-tree-sitter runtime WASM is copied out of node_modules at build time
# (see scripts/copy-tree-sitter-runtime.mjs).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$APP_DIR/resources"

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

download_tree_sitter() {
  if $IF_MISSING && [[ -f "$RESOURCES_DIR/tree-sitter-lex.wasm" ]] && [[ -d "$RESOURCES_DIR/queries" ]]; then
    echo "tree-sitter artifacts already present at $RESOURCES_DIR, skipping"
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
  cp "$tmp_dir/extracted/tree-sitter-lex.wasm" "$RESOURCES_DIR/tree-sitter-lex.wasm"
  cp "$tmp_dir/extracted/queries/"*.scm "$RESOURCES_DIR/queries/"

  rm -rf "$tmp_dir"
  echo "tree-sitter $TS_VERSION → $RESOURCES_DIR"
}

mkdir -p "$RESOURCES_DIR"
download_tree_sitter
