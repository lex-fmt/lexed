#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$APP_DIR/resources"

# lex-lsp version and repository (reads from shared/lex-deps.json)
LEX_CONFIG_SCRIPT="$APP_DIR/scripts/read-lex-config.mjs"

if [[ -z "${LEX_LSP_VERSION:-}" ]]; then
  if ! LEX_LSP_VERSION="$(node "$LEX_CONFIG_SCRIPT" lexLspVersion)"; then
    echo "Unable to determine lex-lsp version" >&2
    exit 1
  fi
fi

if [[ -z "${LEX_LSP_REPO:-}" ]]; then
  if ! LEX_LSP_REPO="$(node "$LEX_CONFIG_SCRIPT" lexLspRepo)"; then
    echo "Unable to determine lex-lsp repository" >&2
    exit 1
  fi
fi

# Detect platform and architecture
detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)
      case "$arch" in
        x86_64) echo "x86_64-unknown-linux-gnu" ;;
        aarch64|arm64) echo "aarch64-unknown-linux-gnu" ;;
        *) echo "x86_64-unknown-linux-gnu" ;;
      esac
      ;;
    Darwin)
      case "$arch" in
        x86_64) echo "x86_64-apple-darwin" ;;
        arm64|aarch64) echo "aarch64-apple-darwin" ;;
        *) echo "x86_64-apple-darwin" ;;
      esac
      ;;
    MINGW*|MSYS*|CYGWIN*|Windows*)
      echo "x86_64-pc-windows-msvc"
      ;;
    *)
      echo "Unknown OS: $os" >&2
      exit 1
      ;;
  esac
}

TARGET_TRIPLE=""
BUILD_FROM_SOURCE=false

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--target <triple>] [--from-source]

Downloads the lex-lsp binary from GitHub releases (or builds from source)
and copies it into the resources directory for bundling with the Electron app.

Options:
  --target <triple>  Target platform (default: auto-detect)
  --from-source      Build from local source instead of downloading

Environment:
  LEX_LSP_VERSION    Version to download (default: $LEX_LSP_VERSION)
  GITHUB_TOKEN       GitHub token for authenticated downloads
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET_TRIPLE="$2"
      shift 2
      ;;
    --from-source)
      BUILD_FROM_SOURCE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

mkdir -p "$RESOURCES_DIR"

if [[ "$BUILD_FROM_SOURCE" == true ]]; then
  # Build from local source (for development)
  REPO_ROOT="$(cd "$APP_DIR/../editors" && pwd)"

  if ! command -v cargo >/dev/null 2>&1; then
    echo "cargo is required to build lex-lsp from source" >&2
    exit 1
  fi

  pushd "$REPO_ROOT" >/dev/null
  if [[ -n "$TARGET_TRIPLE" ]]; then
    cargo build --bin lex-lsp --release --target "$TARGET_TRIPLE"
    BINARY_SRC="$REPO_ROOT/target/$TARGET_TRIPLE/release/lex-lsp"
  else
    cargo build --bin lex-lsp --release
    BINARY_SRC="$REPO_ROOT/target/release/lex-lsp"
  fi
  popd >/dev/null

  if [[ ! -f "$BINARY_SRC" && -f "$BINARY_SRC.exe" ]]; then
    BINARY_SRC="$BINARY_SRC.exe"
  fi

  if [[ ! -f "$BINARY_SRC" ]]; then
    echo "lex-lsp binary not found at $BINARY_SRC" >&2
    exit 1
  fi
else
  # Download from GitHub releases
  if [[ -z "$TARGET_TRIPLE" ]]; then
    TARGET_TRIPLE="$(detect_platform)"
  fi

  echo "Downloading lex-lsp $LEX_LSP_VERSION for $TARGET_TRIPLE..."

  DOWNLOAD_URL="https://github.com/$LEX_LSP_REPO/releases/download/$LEX_LSP_VERSION"

  if [[ "$TARGET_TRIPLE" == *windows* ]]; then
    ARCHIVE_NAME="lex-lsp-$TARGET_TRIPLE.zip"
    BINARY_NAME="lex-lsp.exe"
  else
    ARCHIVE_NAME="lex-lsp-$TARGET_TRIPLE.tar.gz"
    BINARY_NAME="lex-lsp"
  fi

  ARCHIVE_URL="$DOWNLOAD_URL/$ARCHIVE_NAME"
  TMP_DIR="$(mktemp -d)"
  ARCHIVE_PATH="$TMP_DIR/$ARCHIVE_NAME"

  # Download with optional GitHub token
  CURL_OPTS=(-fsSL -o "$ARCHIVE_PATH")
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    CURL_OPTS+=(-H "Authorization: Bearer $GITHUB_TOKEN")
  fi

  if ! curl "${CURL_OPTS[@]}" "$ARCHIVE_URL"; then
    echo "Failed to download $ARCHIVE_URL" >&2
    rm -rf "$TMP_DIR"
    exit 1
  fi

  # Extract
  pushd "$TMP_DIR" >/dev/null
  if [[ "$ARCHIVE_NAME" == *.zip ]]; then
    unzip -q "$ARCHIVE_NAME"
  else
    tar -xzf "$ARCHIVE_NAME"
  fi
  popd >/dev/null

  BINARY_SRC="$TMP_DIR/$BINARY_NAME"
  if [[ ! -f "$BINARY_SRC" ]]; then
    echo "Binary not found in archive" >&2
    rm -rf "$TMP_DIR"
    exit 1
  fi
fi

# Copy binary to resources
DEST_PATH="$RESOURCES_DIR/lex-lsp"
if [[ "$BINARY_SRC" == *.exe ]]; then
  DEST_PATH="$DEST_PATH.exe"
fi

cp "$BINARY_SRC" "$DEST_PATH"
chmod +x "$DEST_PATH"

# Cleanup temp dir if we downloaded
if [[ -n "${TMP_DIR:-}" ]]; then
  rm -rf "$TMP_DIR"
fi

echo "lex-lsp $LEX_LSP_VERSION copied to $DEST_PATH"
