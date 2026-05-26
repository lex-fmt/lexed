#!/usr/bin/env bash
set -euo pipefail

# Downloads tree-sitter parser WASMs and highlight queries for the
# languages listed in the embedded-grammars manifest. The manifest is
# shipped inside the tree-sitter-lex release tarball and extracted by
# download-tree-sitter.sh, so vscode and lexed consume the same curated
# list — bumping tree-sitter-lex bumps the bundle here.
#
# Layout per language:
#   resources/embedded-grammars/<lang>/parser.wasm
#   resources/embedded-grammars/<lang>/highlights.scm
#   resources/embedded-grammars/<lang>/.version  (sidecar; "vX.Y.Z")
#
# A `.version` mismatch triggers a re-download on the next run, mirroring
# the pattern in download-tree-sitter.sh.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GRAMMARS_DIR="$APP_DIR/resources/embedded-grammars"
MANIFEST="$APP_DIR/resources/embedded-grammars.json"

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

if [[ ! -f "$MANIFEST" ]]; then
  echo "error: $MANIFEST not found — run app-bin/download-tree-sitter.sh first" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (apt-get install jq / brew install jq)" >&2
  exit 1
fi

curl_opts=(-fsSL)
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  curl_opts+=(-H "Authorization: Bearer $GITHUB_TOKEN")
fi

count=$(jq '.grammars | length' "$MANIFEST")

# Fast path for the npm `--if-missing` hooks: if every grammar's stamp
# matches the manifest version, skip the loop entirely.
if $IF_MISSING; then
  all_present=true
  for i in $(seq 0 $((count - 1))); do
    lang=$(jq -r ".grammars[$i].name" "$MANIFEST")
    version=$(jq -r ".grammars[$i].version" "$MANIFEST")
    stamp="$GRAMMARS_DIR/$lang/.version"
    if [[ ! -f "$stamp" ]] || [[ "$(cat "$stamp")" != "$version" ]]; then
      all_present=false
      break
    fi
  done
  if $all_present; then
    echo "embedded grammars already installed in $GRAMMARS_DIR, skipping"
    exit 0
  fi
fi

for i in $(seq 0 $((count - 1))); do
  lang=$(jq -r ".grammars[$i].name" "$MANIFEST")
  version=$(jq -r ".grammars[$i].version" "$MANIFEST")
  repo=$(jq -r ".grammars[$i].repo" "$MANIFEST")
  wasm_asset=$(jq -r ".grammars[$i].wasm_asset" "$MANIFEST")
  queries_path=$(jq -r ".grammars[$i].queries_path" "$MANIFEST")

  lang_dir="$GRAMMARS_DIR/$lang"
  version_stamp="$lang_dir/.version"
  wasm_path="$lang_dir/parser.wasm"
  highlights_path="$lang_dir/highlights.scm"

  if [[ -f "$wasm_path" ]] \
     && [[ -f "$highlights_path" ]] \
     && [[ -f "$version_stamp" ]] \
     && [[ "$(cat "$version_stamp")" == "$version" ]]; then
    echo "embedded grammar $lang $version already installed"
    continue
  fi

  echo "Downloading embedded grammar $lang $version..."
  mkdir -p "$lang_dir"

  wasm_url="https://github.com/$repo/releases/download/$version/$wasm_asset"
  if ! curl "${curl_opts[@]}" -o "$wasm_path" "$wasm_url"; then
    echo "Failed to download $wasm_url" >&2
    exit 1
  fi

  highlights_url="https://raw.githubusercontent.com/$repo/$version/$queries_path"
  if ! curl "${curl_opts[@]}" -o "$highlights_path" "$highlights_url"; then
    echo "Failed to download $highlights_url" >&2
    exit 1
  fi

  printf '%s' "$version" > "$version_stamp"
  echo "embedded grammar $lang $version installed at $lang_dir"
done
