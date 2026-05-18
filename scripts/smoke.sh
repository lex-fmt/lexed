#!/usr/bin/env bash
# Packaged-binary smoke test for the canonical electron-app workflow.
#
# Convention-based hook detected by
# arthur-debert/release/.github/workflows/electron-app.yml — it
# `hashFiles('scripts/smoke.sh')` and runs this script after build,
# before artifact upload, when the file is present.
#
# Goal: catch "ships but won't launch" regressions — missing bundled
# lexd-lsp, broken renderer mount, crash-on-startup, Windows path
# quirks. Wraps Playwright's `packaged` project (the same test surface
# the previous in-tree release.yml exercised), so any tests that
# survived in tests/e2e/ with `--project=packaged` keep running here.
#
# Env vars provided by the canonical workflow:
#   PLATFORM     mac | linux | windows
#   ARCH         arm64 | x64 | ...
#   PACKAGE_DIR  electron-builder directories.output (here: `release`)
#
# Env vars Playwright reads (matches the old release.yml's shape):
#   PACKAGED_APP_PATH    absolute path to the packaged executable
#   E2E_SKIP_BUILD=1     don't re-pack inside Playwright globalSetup
#                        (electron-builder already produced the build).
#
# Smoke runs AFTER electron-builder signing AND notarization — keep
# the script read-only (launch + check); ANY artifact modification
# here invalidates the notarization.

set -euo pipefail

case "${PLATFORM}" in
  mac)
    PACKAGED_APP_PATH="${PACKAGE_DIR}/mac-${ARCH}/LexEd.app/Contents/MacOS/LexEd"
    SMOKE_PREFIX=()
    ;;
  linux)
    # electron-builder produces `linux-unpacked/` for single-arch
    # linux builds (no arch suffix on x64). If a future arch like
    # arm64 is enabled, this branch would need PLATFORM/ARCH
    # composition matching electron-builder's per-arch dir naming.
    PACKAGED_APP_PATH="${PACKAGE_DIR}/linux-unpacked/lexed"
    # `xvfb-run -a` provides a headless X11 display so the packaged
    # Electron binary can open its window during the smoke run on a
    # Linux runner without a real display.
    SMOKE_PREFIX=(xvfb-run -a)
    ;;
  windows)
    PACKAGED_APP_PATH="${PACKAGE_DIR}/win-unpacked/LexEd.exe"
    SMOKE_PREFIX=()
    ;;
  *)
    echo "smoke.sh: unknown PLATFORM='${PLATFORM:-}' (expected mac|linux|windows)" >&2
    exit 2
    ;;
esac

if [ ! -e "${PACKAGED_APP_PATH}" ]; then
  echo "smoke.sh: packaged binary not found at ${PACKAGED_APP_PATH}" >&2
  echo "smoke.sh: expected layout for PLATFORM=${PLATFORM} ARCH=${ARCH} PACKAGE_DIR=${PACKAGE_DIR}" >&2
  echo "smoke.sh: contents of PACKAGE_DIR:" >&2
  ls -la "${PACKAGE_DIR}" >&2 || true
  exit 1
fi

export PACKAGED_APP_PATH
export E2E_SKIP_BUILD=1

echo "smoke.sh: PLATFORM=${PLATFORM} ARCH=${ARCH} → ${PACKAGED_APP_PATH}"
echo "smoke.sh: running Playwright packaged project"

"${SMOKE_PREFIX[@]}" npx playwright test --project=packaged
