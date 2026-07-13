#!/usr/bin/env bash
# Self-provisioning for the shipit release BUILD leg (ADP02-WS09, #172).
#
# The wf-build block's checkout provisions nothing beyond pixi (no
# node_modules, no comms submodule, no fetch-deps on PATH — the same
# bare-runner premise the WS03 lanes' test-full/lint-full tasks
# self-provision around), so the `[toolchains]` build override
# (`npm run build:release`, .shipit.toml) runs this script before
# dispatching to the ordinary `npm run build`. Mirrors what the legacy
# arthur-debert/release electron-app.yml@v3 workflow provisioned per leg:
#
#   - the comms submodule — gen-theme.py's canonical theme data
#     (comms/shared/theming/lex-theme.json) rides it, and the wf-build
#     checkout has no submodule support (the shipit#759 pattern);
#   - `npm ci` root + shared/ — @lex/shared is a `file:./shared` dep with
#     its own lockfile; each is a clean lockfile-exact reinstall, so a CI
#     leg and a laptop run are byte-identical (like the test-full lane);
#   - `fetch-deps` — the stdlib-python dependency fetcher (deps.json:
#     lexd-lsp binary, grammar WASM) the build script calls by name. It is
#     not an npm bin, so the legacy workflow curl-provisioned it onto PATH;
#     here it lands in node_modules/.bin, which `npm run` puts on PATH for
#     every script (plus the .cmd shim npm/cmd.exe needs on a windows
#     runner — that leg is blocked on shipit#893 but provisioned for parity).
set -euo pipefail

git submodule update --init --recursive comms

npm ci
npm ci --prefix shared

bin_dir="node_modules/.bin"
curl -fsSL -o "$bin_dir/fetch-deps" \
	"https://raw.githubusercontent.com/arthur-debert/release/main/bin/fetch-deps"
chmod +x "$bin_dir/fetch-deps"
# cmd.exe can't exec a shebang script; route through python explicitly
# (same shim the legacy electron-app.yml wrote).
printf '@python "%%~dp0fetch-deps" %%*\r\n' >"$bin_dir/fetch-deps.cmd"
