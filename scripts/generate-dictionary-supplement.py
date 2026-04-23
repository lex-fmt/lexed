#!/usr/bin/env python3
"""Generate dictionaries/supplement.dic for lexed.

The vendored Hunspell base dictionaries are SCOWL-derived at size=60 and
miss a lot of modern tech / programming / OS / networking vocabulary
(`lifecycle`, `amd64`, `stdin`, `csrf`…). This script builds a single
shared supplement that the spellcheck service layers on top of whichever
language the user selected — tech terms are loanwords, so the same list
is useful for every language we support.

Sources:
  - streetsidesoftware/cspell-dicts (MIT) — the bulk of the vocabulary
  - Hand-curated canary list below — fills obvious gaps cspell-dicts
    omits or only ships in CamelCase

Cache:
  A stamp file at dictionaries/.supplement.stamp stores a hash of all
  inputs (pinned commit, source URL list, canary lists, languages). A
  run whose stamp matches is a no-op. `--force` regenerates anyway;
  `--check` exits non-zero if the stamp doesn't match (CI use).

Usage:
  python3 scripts/generate-dictionary-supplement.py
  python3 scripts/generate-dictionary-supplement.py --force
  python3 scripts/generate-dictionary-supplement.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT_DIR = ROOT / "dictionaries"
LICENSES_DIR = DICT_DIR / "licenses"
OUTPUT = DICT_DIR / "supplement.dic"
STAMP = DICT_DIR / ".supplement.stamp"

# Pinned upstream — bump to pull newer vocabulary.
CSPELL_COMMIT = "4325f7ffd5c50dfdd0e68821ab2d19abdd925f38"
CSPELL_BASE = (
    f"https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/{CSPELL_COMMIT}"
)

# cspell-dicts source files to pull. Paths under dictionaries/ inside that repo.
CSPELL_SOURCES = [
    "dictionaries/software-terms/src/software-terms.txt",
    "dictionaries/software-terms/src/coding-terms.txt",
    "dictionaries/software-terms/src/computing-acronyms.txt",
    "dictionaries/software-terms/src/network-protocols.txt",
    "dictionaries/software-terms/src/network-os.txt",
    "dictionaries/software-terms/src/software-tools.txt",
    "dictionaries/software-terms/src/software-services.txt",
    "dictionaries/software-terms/src/cybersecurity-terms.txt",
    "dictionaries/fullstack/dict/fullstack.txt",
    "dictionaries/node/dict/node.txt",
    "dictionaries/typescript/dict/typescript.txt",
    "dictionaries/html/dict/html.txt",
    "dictionaries/css/dict/css.txt",
    "dictionaries/k8s/dict/k8s.txt",
]

# License files to vendor alongside the generated supplement.
# (key = destination filename under dictionaries/licenses/)
LICENSE_SOURCES = {
    "cspell-dicts.LICENSE": "dictionaries/software-terms/LICENSE",
}

# Supported language codes — kept here so --check fails loudly if somebody
# adds a .aff/.dic pair without running the generator to stamp it. The
# supplement file itself is shared; languages only affect the stamp hash
# (so dropping support for a language invalidates the cache).
SUPPORTED_LANGUAGES = [
    "de_DE",
    "en_GB",
    "en_US",
    "es_ES",
    "fr_FR",
    "it_IT",
    "nl_NL",
    "pl_PL",
    "pt_BR",
    "ru_RU",
]

# Hand-curated gap fillers. cspell-dicts surprisingly omits a lot of
# obvious tech vocabulary or only ships it in CamelCase form. Anything
# you'd expect a modern developer/tech-writer to type routinely goes
# here. Kept inline rather than as a separate file so the source of each
# entry is clear from `git blame`.
CANARIES_LOWER = {
    # programming / language
    "parsable", "unparseable", "serialisable", "deserialisable",
    "async", "await", "config", "configs", "codebase",
    "runtime", "middleware", "lifecycle", "webhook", "webhooks", "websocket",
    "endpoint", "endpoints", "refactor", "refactored", "refactoring",
    "boilerplate", "polyfill", "transpile", "transpiled", "transpiler",
    "memoize", "memoized", "memoization",
    # architectures / binaries
    "amd64", "arm64", "aarch64", "armv7", "armv8", "ppc64", "riscv",
    "x64", "x86",
    # networking / protocols
    "http", "https", "tcp", "udp", "dns", "dhcp", "smtp", "imap", "pop3",
    "ssh", "sftp", "ftp", "ftps", "rdp", "ntp", "mqtt", "grpc",
    "localhost",
    # identifiers / encodings
    "url", "uri", "urn", "uuid", "guid", "asn1",
    "utf8", "utf16", "utf32", "crlf", "ascii",
    "json", "yaml", "xml", "toml", "ini", "csv", "tsv", "ndjson",
    # compression / hashing
    "gzip", "gunzip", "bzip2", "lzma", "zstd",
    "sha1", "sha256", "sha512", "hmac", "base64", "hexadecimal",
    # i/o streams
    "stdin", "stdout", "stderr",
    # security
    "csrf", "xss", "cors", "tls", "ssl", "vpn", "oauth",
    # general shell / CLI
    "cli", "gui", "tui", "repl",
    # data stores / infra
    "postgres", "postgresql", "mysql", "redis", "sqlite", "mongodb",
    "nginx", "apache", "envoy", "traefik",
    # consumer / hardware
    "podcast", "smartphone", "bluetooth", "wifi", "ethernet",
}

CANARIES_UPPER = {
    "HTTP", "HTTPS", "TCP", "UDP", "DNS", "DHCP", "SMTP", "IMAP", "POP3",
    "SSH", "SFTP", "FTP", "FTPS", "RDP", "NTP", "MQTT", "GRPC",
    "URL", "URI", "URN", "UUID", "GUID",
    "JSON", "YAML", "XML", "TOML", "CSV", "TSV",
    "UTF8", "UTF16", "UTF32", "ASCII",
    "CSRF", "XSS", "CORS", "TLS", "SSL", "VPN",
    "CLI", "GUI", "TUI", "REPL",
    "SHA1", "SHA256", "SHA512", "HMAC", "MD5",
    "OAUTH", "JWT",
    "CPU", "GPU", "RAM", "SSD", "HDD", "USB", "HDMI",
    "IDE", "SDK", "JDK", "JRE", "JVM", "LLVM",
    "IO", "OS",
}

# Filter rules — precision over recall. Dropping CamelCase is intentional:
# our word extractor doesn't split case, and CamelCase tokens almost never
# appear verbatim in prose.
_VOWEL = re.compile(r"[aeiouy]", re.I)
_LOWER = re.compile(r"^[a-z]{2,}[0-9]*$")
_ACRONYM = re.compile(r"^[A-Z]{2,}[0-9]*$")


def fetch(url: str) -> str:
    """Fetch a URL with a polite user-agent; raises on HTTP error."""
    req = urllib.request.Request(url, headers={"User-Agent": "lexed-dict-gen/1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def is_keepable(word: str) -> bool:
    if len(word) < 3:
        return False
    if not _VOWEL.search(word):
        return False
    return bool(_LOWER.match(word) or _ACRONYM.match(word))


def parse_cspell_source(text: str) -> set[str]:
    out: set[str] = set()
    for line in text.splitlines():
        token = line.split("#", 1)[0].strip()
        if token:
            out.add(token)
    return out


def compute_stamp() -> str:
    """Hash of all inputs — if unchanged, supplement.dic is up to date."""
    h = hashlib.sha256()
    h.update(CSPELL_COMMIT.encode())
    h.update(json.dumps(CSPELL_SOURCES, sort_keys=True).encode())
    h.update(json.dumps(sorted(LICENSE_SOURCES.items()), sort_keys=True).encode())
    h.update(json.dumps(SUPPORTED_LANGUAGES, sort_keys=True).encode())
    h.update(json.dumps(sorted(CANARIES_LOWER), sort_keys=True).encode())
    h.update(json.dumps(sorted(CANARIES_UPPER), sort_keys=True).encode())
    return h.hexdigest()


def read_stamp() -> str | None:
    if STAMP.exists():
        return STAMP.read_text().strip()
    return None


def generate() -> list[str]:
    raw: set[str] = set()
    for rel in CSPELL_SOURCES:
        url = f"{CSPELL_BASE}/{rel}"
        print(f"  fetch {rel}", file=sys.stderr)
        raw |= parse_cspell_source(fetch(url))
    print(f"  cspell raw entries: {len(raw)}", file=sys.stderr)

    clean = {w for w in raw if is_keepable(w)} | CANARIES_LOWER | CANARIES_UPPER
    print(f"  after filter + canaries: {len(clean)}", file=sys.stderr)
    return sorted(clean)


def write_supplement(words: list[str]) -> None:
    # Hunspell .dic format: first line is the entry count.
    lines = [str(len(words))] + words + [""]
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")


def write_licenses() -> None:
    LICENSES_DIR.mkdir(parents=True, exist_ok=True)
    for dest, rel in LICENSE_SOURCES.items():
        url = f"{CSPELL_BASE}/{rel}"
        print(f"  fetch license {dest}", file=sys.stderr)
        (LICENSES_DIR / dest).write_text(fetch(url), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="regenerate even if stamp matches")
    ap.add_argument(
        "--check",
        action="store_true",
        help="exit non-zero if output is stale (CI mode); no network calls",
    )
    args = ap.parse_args()

    expected = compute_stamp()
    actual = read_stamp()

    if args.check:
        if actual == expected and OUTPUT.exists():
            print("supplement.dic is up to date")
            return 0
        print(
            "supplement.dic is stale — run `python3 scripts/generate-dictionary-supplement.py`",
            file=sys.stderr,
        )
        return 1

    if not args.force and actual == expected and OUTPUT.exists():
        print(f"supplement.dic is up to date ({OUTPUT.name}, stamp {expected[:12]})")
        return 0

    print("Generating supplement.dic…", file=sys.stderr)
    try:
        words = generate()
        write_licenses()
    except urllib.error.URLError as e:
        print(f"fetch failed: {e}", file=sys.stderr)
        return 2

    write_supplement(words)
    STAMP.write_text(expected + "\n", encoding="utf-8")

    print(
        f"  wrote {OUTPUT.relative_to(ROOT)} ({len(words)} entries) "
        f"for languages: {', '.join(SUPPORTED_LANGUAGES)}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
