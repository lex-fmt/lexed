#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$APP_DIR/resources"
LEX_DEPS="$APP_DIR/shared/lex-deps.json"

# ---------------------------------------------------------------------------
# Read dep metadata from lex-deps.json via read-lex-config.mjs
# ---------------------------------------------------------------------------
dep_field() {
  local dep="$1" field="$2"
  node "$SCRIPT_DIR/read-lex-config.mjs" "$dep" "$field"
}

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------
detect_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Linux)
      case "$arch" in
        x86_64)        echo "x86_64-unknown-linux-gnu" ;;
        aarch64|arm64) echo "aarch64-unknown-linux-gnu" ;;
        *)             echo "x86_64-unknown-linux-gnu" ;;
      esac ;;
    Darwin)
      case "$arch" in
        x86_64)        echo "x86_64-apple-darwin" ;;
        arm64|aarch64) echo "aarch64-apple-darwin" ;;
        *)             echo "x86_64-apple-darwin" ;;
      esac ;;
    MINGW*|MSYS*|CYGWIN*|Windows*)
      echo "x86_64-pc-windows-msvc" ;;
    *)
      echo "Unknown OS: $os" >&2; exit 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# Download a single dep from GitHub releases
# ---------------------------------------------------------------------------
download_dep() {
  local dep="$1" target="$2"
  local version repo
  version="$(dep_field "$dep" version)"
  repo="$(dep_field "$dep" repo)"

  local is_windows=false
  [[ "$target" == *windows* ]] && is_windows=true

  local archive_name binary_name
  if $is_windows; then
    archive_name="${dep}-${target}.zip"
    binary_name="${dep}.exe"
  else
    archive_name="${dep}-${target}.tar.gz"
    binary_name="$dep"
  fi

  local url="https://github.com/${repo}/releases/download/${version}/${archive_name}"

  echo "Downloading $dep $version for $target..."

  local tmp_dir
  tmp_dir="$(mktemp -d)"

  local curl_opts=(-fsSL -o "$tmp_dir/$archive_name")
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    curl_opts+=(-H "Authorization: Bearer $GITHUB_TOKEN")
  fi

  if ! curl "${curl_opts[@]}" "$url"; then
    echo "Failed to download $url" >&2
    rm -rf "$tmp_dir"
    exit 1
  fi

  pushd "$tmp_dir" >/dev/null
  if [[ "$archive_name" == *.zip ]]; then
    unzip -q "$archive_name"
  else
    tar -xzf "$archive_name"
  fi
  popd >/dev/null

  if [[ ! -f "$tmp_dir/$binary_name" ]]; then
    echo "Binary $binary_name not found in archive" >&2
    rm -rf "$tmp_dir"
    exit 1
  fi

  local dest="$RESOURCES_DIR/$dep"
  $is_windows && dest="${dest}.exe"
  cp "$tmp_dir/$binary_name" "$dest"
  chmod +x "$dest"
  rm -rf "$tmp_dir"

  echo "$dep $version → $dest"
}

# ---------------------------------------------------------------------------
# Build a dep from local source
# ---------------------------------------------------------------------------
build_dep() {
  local dep="$1" target="$2"

  case "$dep" in
    lexd-lsp)
      local repo_root
      repo_root="$(cd "$APP_DIR/.." && pwd)/lex"
      if [[ ! -d "$repo_root" ]]; then
        echo "Local lex repo not found at $repo_root" >&2
        echo "Clone it:  gh repo clone lex-fmt/lex ../lex" >&2
        exit 1
      fi
      if ! command -v cargo >/dev/null 2>&1; then
        echo "cargo is required to build lexd-lsp from source" >&2
        exit 1
      fi
      pushd "$repo_root" >/dev/null
      if [[ -n "$target" ]]; then
        cargo build --bin lexd-lsp --release --target "$target"
        local bin_src="$repo_root/target/$target/release/lexd-lsp"
      else
        cargo build --bin lexd-lsp --release
        local bin_src="$repo_root/target/release/lexd-lsp"
      fi
      popd >/dev/null
      [[ ! -f "$bin_src" && -f "${bin_src}.exe" ]] && bin_src="${bin_src}.exe"
      if [[ ! -f "$bin_src" ]]; then
        echo "lexd-lsp binary not found at $bin_src" >&2
        exit 1
      fi
      local dest="$RESOURCES_DIR/lexd-lsp"
      [[ "$bin_src" == *.exe ]] && dest="${dest}.exe"
      cp "$bin_src" "$dest"
      chmod +x "$dest"
      echo "lexd-lsp (from source) → $dest"
      ;;
    *)
      echo "Don't know how to build $dep from source" >&2
      exit 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
TARGET_TRIPLE=""
FROM_SOURCE=false
IF_MISSING=false
REQUESTED_DEP=""

usage() {
  cat <<USAGE
Usage: $(basename "$0") [OPTIONS] [DEP]

Fetch external dependencies declared in shared/lex-deps.json.

Arguments:
  DEP                  Fetch only this dep (default: all deps)

Options:
  --target <triple>    Target platform (default: auto-detect)
  --from-source        Build from local source instead of downloading
  --if-missing         Only fetch deps whose binary is not already present
  -h, --help           Show this help

Environment:
  GITHUB_TOKEN         GitHub token for authenticated downloads
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)      TARGET_TRIPLE="$2"; shift 2 ;;
    --from-source) FROM_SOURCE=true;   shift ;;
    --if-missing)  IF_MISSING=true;    shift ;;
    -h|--help)     usage; exit 0 ;;
    -*)            echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
    *)             REQUESTED_DEP="$1"; shift ;;
  esac
done

mkdir -p "$RESOURCES_DIR"

[[ -z "$TARGET_TRIPLE" ]] && TARGET_TRIPLE="$(detect_target)"

# Enumerate deps to process
if [[ -n "$REQUESTED_DEP" ]]; then
  DEPS=("$REQUESTED_DEP")
else
  DEPS=($(node "$SCRIPT_DIR/read-lex-config.mjs" --list-deps))
fi

for dep in "${DEPS[@]}"; do
  binary_name="$dep"
  [[ "$TARGET_TRIPLE" == *windows* ]] && binary_name="${dep}.exe"
  dest="$RESOURCES_DIR/$binary_name"

  if $IF_MISSING && [[ -f "$dest" ]]; then
    echo "$dep: already present at $dest, skipping"
    continue
  fi

  if $FROM_SOURCE; then
    build_dep "$dep" "$TARGET_TRIPLE"
  else
    download_dep "$dep" "$TARGET_TRIPLE"
  fi
done
