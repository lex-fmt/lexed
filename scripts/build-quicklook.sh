#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skipping QuickLook build (macOS only)"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_PATH="$APP_DIR/quicklook/LexQuickLook.xcodeproj"
SCHEME="LexQuickLook"
CONFIGURATION="Release"
OUTPUT_DIR="$APP_DIR/build/quicklook"
DERIVED_DATA="$HOME/Library/Developer/Xcode/DerivedData"

xcodebuild -project "$PROJECT_PATH" -scheme "$SCHEME" -configuration "$CONFIGURATION" build

mapfile -t build_dirs < <(ls -dt "$DERIVED_DATA"/LexQuickLook-*/Build/Products/Release 2>/dev/null || true)
if [[ ${#build_dirs[@]} -eq 0 ]]; then
  echo "Unable to locate LexQuickLook build artifacts in DerivedData" >&2
  exit 1
fi

LATEST_BUILD_DIR="${build_dirs[0]}"
SOURCE_APPEX="$LATEST_BUILD_DIR/LexQuickLook.appex"

if [[ ! -d "$SOURCE_APPEX" ]]; then
  echo "QuickLook appex not found at $SOURCE_APPEX" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
cp -R "$SOURCE_APPEX" "$OUTPUT_DIR/"

echo "QuickLook appex copied to $OUTPUT_DIR"
