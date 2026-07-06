#!/usr/bin/env python3
"""Generate packages/lex-buffer/src/monaco/theme-data.ts from the canonical theme data in
`comms/shared/theming/lex-theme.json`.

Emits two structures, both pre-resolved per mode at generate time:

- PALETTE: the 4 intensity tiers + code_bg, for each mode. Used by the
  runtime to look up editor-chrome colors (line numbers etc.) that
  reference an intensity tier.
- RULES: per-mode token rule list. Each entry carries already-resolved
  `foreground` (and optional `background`) hex strings in Monaco's
  no-`#` form, ready to drop straight into `monaco.editor.defineTheme`'s
  `rules`.

Splitting per mode (rather than carrying intensity references the
runtime resolves) matches how every other editor in the workspace
ships their theme: canonical → absolute hex at generate time.

Output style matches lexed's prettier config (no semicolons, single
quotes, tabWidth=2). Run after editing the canonical file. The npm
`theme:check` script runs `gen-theme.py --check`; pre-commit and
CI fail on stale output.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_DIR = Path(__file__).resolve().parent.parent
CANONICAL = REPO_DIR / "comms" / "shared" / "theming" / "lex-theme.json"
TARGET = REPO_DIR / "packages" / "lex-buffer" / "src" / "monaco" / "theme-data.ts"


def s(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def font_style(token: dict) -> str | None:
    styles = token.get("styles", [])
    return " ".join(styles) if styles else None


def strip_hash(value: str) -> str:
    return value[1:] if value.startswith("#") else value


EXPECTED_INTENSITIES = ("normal", "muted", "faint", "faintest")
EXPECTED_BACKGROUNDS = ("code_bg",)


def validate_canonical(canonical: dict) -> None:
    """The emitted TS hard-codes the `ColorPalette` interface fields and
    pre-resolves every entry of `PALETTE` / `RULES` against the expected
    intensity and background keys. If the canonical schema grows or
    shrinks a tier, the generator would silently emit malformed TS (a
    KeyError mid-render, or a `ColorPalette` whose declared fields no
    longer match what's emitted). Fail loudly here instead, so the
    divergence surfaces at generate time with a clear message.

    Validation compares key sets (not key order), so a JSON formatter that
    reorders keys won't break this. Output order is still pinned to
    EXPECTED_INTENSITIES / EXPECTED_BACKGROUNDS in render() for stable diffs.
    """
    actual_intensities = set(canonical["intensities"].keys())
    expected_intensities = set(EXPECTED_INTENSITIES)
    if actual_intensities != expected_intensities:
        missing = [k for k in EXPECTED_INTENSITIES if k not in actual_intensities]
        unexpected = sorted(actual_intensities - expected_intensities)
        raise SystemExit(
            f"FAIL: canonical intensities must be exactly {list(EXPECTED_INTENSITIES)}.\n"
            f"      Missing: {missing}; unexpected: {unexpected}.\n"
            f"      Update EXPECTED_INTENSITIES and the emitted ColorPalette "
            f"interface in this generator's render() to match "
            f"comms/shared/theming/lex-theme.json, then re-run."
        )
    actual_backgrounds = set(canonical.get("backgrounds", {}).keys())
    expected_backgrounds = set(EXPECTED_BACKGROUNDS)
    if actual_backgrounds != expected_backgrounds:
        missing = [k for k in EXPECTED_BACKGROUNDS if k not in actual_backgrounds]
        unexpected = sorted(actual_backgrounds - expected_backgrounds)
        raise SystemExit(
            f"FAIL: canonical backgrounds must be exactly {list(EXPECTED_BACKGROUNDS)}.\n"
            f"      Missing: {missing}; unexpected: {unexpected}.\n"
            f"      Update EXPECTED_BACKGROUNDS and the emitted ColorPalette "
            f"interface in this generator's render() to match "
            f"comms/shared/theming/lex-theme.json, then re-run."
        )


def render_palette_block(canonical: dict, mode: str) -> str:
    intensities = canonical["intensities"]
    backgrounds = canonical["backgrounds"]
    lines = []
    for name in EXPECTED_INTENSITIES:
        lines.append(f"    {name}: {s(intensities[name][mode])},")
    for bg_name in EXPECTED_BACKGROUNDS:
        lines.append(f"    {bg_name}: {s(backgrounds[bg_name][mode])},")
    return "\n".join(lines)


def render_rules_block(canonical: dict, mode: str) -> str:
    intensities = canonical["intensities"]
    backgrounds = canonical["backgrounds"]
    tokens = canonical["tokens"]
    lines: list[str] = []
    for token_id, token in tokens.items():
        # Monaco token rules want hex without the leading '#'.
        fg = strip_hash(intensities[token["intensity"]][mode])
        fields = [f"token: {s(token_id)}", f"foreground: {s(fg)}"]
        fs = font_style(token)
        if fs:
            fields.append(f"fontStyle: {s(fs)}")
        if "background" in token:
            bg = strip_hash(backgrounds[token["background"]][mode])
            fields.append(f"background: {s(bg)}")
        lines.append("    { " + ", ".join(fields) + " },")
    return "\n".join(lines)


def render(canonical: dict) -> str:
    validate_canonical(canonical)
    return (
        "// Generated by app-bin/gen-theme.py from\n"
        "// comms/shared/theming/lex-theme.json. Do not edit by hand.\n"
        "//\n"
        "// Lex Monochrome rules + palette, pre-resolved per mode. Consumed\n"
        "// by packages/lex-buffer/src/monaco/theme.ts. All colors are absolute hex strings\n"
        "// resolved from canonical intensity/background tiers at generate\n"
        "// time — no runtime indirection.\n"
        "\n"
        "export interface ColorPalette {\n"
        "  normal: string\n"
        "  muted: string\n"
        "  faint: string\n"
        "  faintest: string\n"
        "  code_bg: string\n"
        "}\n"
        "\n"
        "export interface TokenRule {\n"
        "  token: string\n"
        "  foreground: string\n"
        "  fontStyle?: string\n"
        "  background?: string\n"
        "}\n"
        "\n"
        "export const PALETTE: { light: ColorPalette; dark: ColorPalette } = {\n"
        "  light: {\n"
        f"{render_palette_block(canonical, 'light')}\n"
        "  },\n"
        "  dark: {\n"
        f"{render_palette_block(canonical, 'dark')}\n"
        "  },\n"
        "}\n"
        "\n"
        "export const RULES: { light: TokenRule[]; dark: TokenRule[] } = {\n"
        "  light: [\n"
        f"{render_rules_block(canonical, 'light')}\n"
        "  ],\n"
        "  dark: [\n"
        f"{render_rules_block(canonical, 'dark')}\n"
        "  ],\n"
        "}\n"
    )


def main() -> int:
    if not CANONICAL.exists():
        print(
            f"FAIL: canonical theme not found at {CANONICAL.relative_to(REPO_DIR)}.\n"
            f"      Did you forget `git submodule update --init`?",
            file=sys.stderr,
        )
        return 1

    canonical = json.loads(CANONICAL.read_text(encoding="utf-8"))
    expected = render(canonical)
    TARGET.parent.mkdir(parents=True, exist_ok=True)

    if "--check" in sys.argv:
        if not TARGET.exists():
            print(f"FAIL: {TARGET.relative_to(REPO_DIR)} missing", file=sys.stderr)
            return 1
        # Normalize CRLF→LF so a Windows checkout that rewrote line endings
        # doesn't false-fail this comparison.
        actual = TARGET.read_text(encoding="utf-8").replace("\r\n", "\n")
        if actual != expected:
            print(
                f"FAIL: {TARGET.relative_to(REPO_DIR)} out of sync.\n"
                f"      Run: python3 app-bin/gen-theme.py",
                file=sys.stderr,
            )
            return 1
        print(f"  OK {TARGET.relative_to(REPO_DIR)} matches generator")
        return 0

    TARGET.write_text(expected, encoding="utf-8")
    print(f"wrote {TARGET.relative_to(REPO_DIR)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
