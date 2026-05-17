#!/usr/bin/env bash
# scripts/setup-dev-env.sh — per-session dev-environment setup, invoked by
# the SessionStart hook in .claude/settings.json.
#
# Source of truth: arthur-debert/release templates/setup-dev-env.sh.
# Re-sync via the gh-repo-setup skill (or by copying this file verbatim).
# Repos that need project-specific extras (Xvfb daemon, pinned-binary
# fetch, extra rustup targets, etc.) append them below the marker at the
# bottom — anything above it is rsync'd from the template.
#
# Cloud-only: local sessions exit early (devs already have their env).
# Detects stack by filesystem signals — handles rust, node, ruby, python,
# and consumers with no project deps (just lefthook / hand-rolled hook
# wiring).
#
# Idempotent — safe to re-run. Errors are best-effort: a failure in one
# step does not abort the rest (transient registry hiccups shouldn't
# block the lefthook install).

set -euo pipefail

# Cloud-only gate. Local sessions already have their env set up.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

# --- 1. Universal git hygiene --------------------------------------------
# Cloud clones are shallow; restore submodule content and release tags.
# Submodule update is a no-op when in sync; tag fetch is one round-trip.

if [ -f .gitmodules ]; then
  git submodule update --init --recursive --quiet || true
fi
git fetch --tags --quiet origin || true

# --- 2. Project dep cache ------------------------------------------------
# Pick the right tool based on lockfile / manifest. Per stack, idempotent.

# Rust: cargo fetch with --locked so we don't silently mutate Cargo.lock.
if [ -f Cargo.toml ] && command -v cargo >/dev/null 2>&1; then
  cargo fetch --locked --quiet || true
fi

# Node (npm/yarn/pnpm). We deliberately do NOT guard on `! -d node_modules`:
# the env-snapshot caches a node_modules paired with a previous branch's
# lockfile, and a feature branch that bumps the lockfile (Playwright is
# the canonical case) drifts silently. Re-installing when already in sync
# is ~2s; chasing a stale lockfile bug is hours. Pay the two seconds.
if [ -f package.json ]; then
  if [ -f package-lock.json ] && command -v npm >/dev/null 2>&1; then
    npm ci 2>/dev/null || npm install
  elif [ -f yarn.lock ] && command -v yarn >/dev/null 2>&1; then
    yarn install --frozen-lockfile 2>/dev/null || yarn install
  elif [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  fi
fi

# Ruby / Bundler.
if [ -f Gemfile ] && command -v bundle >/dev/null 2>&1; then
  bundle install --quiet || true
fi

# Python / pip + venv. Only initialise if .venv missing — pip install is
# slower than node/cargo and the guard wins more than it costs.
if [ -f pyproject.toml ] && [ ! -d .venv ] && command -v python3 >/dev/null 2>&1; then
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip --quiet || true
  .venv/bin/pip install -e '.[dev]' --quiet 2>/dev/null \
    || .venv/bin/pip install -e . --quiet 2>/dev/null \
    || true
fi

# --- 3. Pre-commit hook wiring -------------------------------------------
# Default: lefthook (binary installed at env-setup time). Fallback for
# repos that ship a hand-rolled scripts/pre-commit instead (zed-lex,
# tree-sitter-lex pattern): symlink it into .git/hooks/.

if [ -f lefthook.yml ] && command -v lefthook >/dev/null 2>&1; then
  if ! lefthook install >/dev/null; then
    echo "warning: lefthook install failed — pre-commit hook NOT wired" >&2
  fi
elif [ -x scripts/pre-commit ]; then
  mkdir -p .git/hooks
  ln -sf ../../scripts/pre-commit .git/hooks/pre-commit
fi

# --- 4. Project-local extras ---------------------------------------------
# Everything above this marker is the canonical cross-repo setup-dev-env.sh
# from arthur-debert/release templates/setup-dev-env.sh. Do NOT modify it
# in-place; consumers append project-specific steps BELOW this marker.
# (See e.g. lex-fmt/lexed for an Xvfb start, lex-fmt/nvim for pinned-bin
# fetches.)


# Headless display (Xvfb) for Electron / GUI e2e tests.
# The pre-commit hook here runs `npm run test:e2e:built`, which launches
# Electron — without DISPLAY, Chromium aborts with "Missing X server or
# $DISPLAY" and SIGSEGVs. We start an Xvfb daemon on :99 once per
# session (idempotent — `pgrep` filters out the matcher's own argv via
# the $$ guard) and export DISPLAY for the current shell. Future
# interactive shells pick it up from ~/.bashrc / ~/.profile; the
# pre-commit hook should be run with DISPLAY=:99 in its env (the Bash
# tool's non-interactive shells don't source profile files).
if [ "$(uname -s)" = "Linux" ] && command -v Xvfb >/dev/null 2>&1; then
  if ! pgrep -fa 'Xvfb :99' 2>/dev/null | awk -v me=$$ '$1 != me {found=1} END {exit !found}'; then
    nohup Xvfb :99 -screen 0 1280x1024x24 >/dev/null 2>&1 &
    disown 2>/dev/null || true
  fi
  export DISPLAY=:99
  for f in "${HOME}/.bashrc" "${HOME}/.profile"; do
    [ -f "$f" ] || continue
    grep -q '^export DISPLAY=:99' "$f" 2>/dev/null || echo 'export DISPLAY=:99' >> "$f"
  done
  # The pre-commit hook runs from `git commit`'s non-interactive,
  # non-login shell, which sources neither ~/.bashrc nor ~/.profile.
  # Husky v9 (.husky/_/h) DOES source ${XDG_CONFIG_HOME:-~/.config}/husky/init.sh
  # before every hook, so wire DISPLAY in there too — without this,
  # Electron in test:e2e:built aborts every spec with "Missing X server
  # or $DISPLAY" and the whole pre-commit suite is red.
  husky_init_dir="${XDG_CONFIG_HOME:-${HOME}/.config}/husky"
  husky_init="${husky_init_dir}/init.sh"
  mkdir -p "${husky_init_dir}"
  if [ ! -f "${husky_init}" ] || ! grep -q '^export DISPLAY=:99' "${husky_init}" 2>/dev/null; then
    echo 'export DISPLAY=:99' >> "${husky_init}"
  fi
fi

# Chromium trust store for the sandbox-egress TLS-inspection CA.
# The cloud env's egress proxy MITMs HTTPS and re-signs every cert with an
# "Anthropic sandbox-egress…CA" issuer. That CA ships in the system bundle
# (/etc/ssl/certs/ca-certificates.crt), which is why curl/Node succeed —
# but Chromium on Linux ignores the OpenSSL bundle and reads its own
# NSS DB at ~/.pki/nssdb. Without the CA imported there, Electron's
# Chromium renderer rejects every HTTPS resource the preview iframe loads
# (Google Fonts, the lex-lsp HTML template's CDN assets) with
# ERR_CERT_AUTHORITY_INVALID, surfaces it as a console.error, and the
# e2e harness' runtime-error fixture (tests/e2e/lib/app.ts) auto-fails
# the test. preview.spec.ts is the canonical victim.
#
# Fix: install certutil (libnss3-tools) if missing, init an empty NSS DB
# at ~/.pki/nssdb, then import every Anthropic sandbox CA found in the
# system bundle as a trusted SSL root. Idempotent — re-imports a-CA-by-
# nickname is a no-op once present.
if [ "$(uname -s)" = "Linux" ] && [ -f /etc/ssl/certs/ca-certificates.crt ]; then
  if ! command -v certutil >/dev/null 2>&1; then
    # Cloud envs run this script as root (gated above on
    # CLAUDE_CODE_REMOTE=true), so apt-get works without sudo.
    if command -v apt-get >/dev/null 2>&1; then
      DEBIAN_FRONTEND=noninteractive apt-get install -y libnss3-tools >/dev/null 2>&1 || true
    fi
  fi
  if command -v certutil >/dev/null 2>&1; then
    nssdb="${HOME}/.pki/nssdb"
    mkdir -p "${nssdb}"
    if [ ! -f "${nssdb}/cert9.db" ]; then
      certutil -d "sql:${nssdb}" -N --empty-password >/dev/null 2>&1 || true
    fi
    sandbox_ca_tmp="$(mktemp -d)"
    awk '
      /-----BEGIN CERTIFICATE-----/ { n++; fn = sandbox_dir "/cert_" n ".pem"; in_cert = 1 }
      in_cert                       { print > fn }
      /-----END CERTIFICATE-----/   { in_cert = 0; close(fn) }
    ' sandbox_dir="${sandbox_ca_tmp}" /etc/ssl/certs/ca-certificates.crt
    for pem in "${sandbox_ca_tmp}"/cert_*.pem; do
      [ -f "${pem}" ] || continue
      subject="$(openssl x509 -in "${pem}" -noout -subject 2>/dev/null || true)"
      case "${subject}" in
        *Anthropic*sandbox-egress*)
          # OpenSSL prints `subject=` then RDNs; the CN separator is
          # `CN = ` on 1.1+ and `CN=` with -nameopt compat — match both,
          # and emit only if the substitution matched so a subject with
          # no CN (shouldn't happen for these CAs but defensively) gives
          # an empty nick instead of the full subject line.
          nick="$(printf '%s' "${subject}" | sed -nE 's/.*CN *= *([^,]+).*/\1/p')"
          [ -n "${nick}" ] || continue
          if ! certutil -d "sql:${nssdb}" -L -n "${nick}" >/dev/null 2>&1; then
            certutil -d "sql:${nssdb}" -A -t "C,," -n "${nick}" -i "${pem}" >/dev/null 2>&1 || true
          fi
          ;;
      esac
    done
    rm -rf "${sandbox_ca_tmp}"
  fi
fi

exit 0
