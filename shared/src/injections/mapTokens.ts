import { SEMANTIC_TOKEN_MAP } from './constants.js';
import type {
  DecorationCategory,
  InjectionRange,
  InjectionZone,
  SemanticTokens,
} from './types.js';

/**
 * Walks a semantic-tokens payload produced against a zone's virtual
 * document and appends the host-neutral `InjectionRange`s per category into
 * `rangesByCategory`.
 *
 * The LSP semantic-tokens wire format encodes each token as five u32 deltas:
 *   [deltaLine, deltaStart, length, typeIndex, modifierBitset]
 *
 * We decode the running (line, startChar) position and translate it from the
 * virtual document (which contains only the zone text) back into coordinates
 * of the real document. The first line of the zone is offset by
 * `zone.startCol`; subsequent lines use raw `startChar`.
 *
 * Tokens whose type is unknown (`legend.tokenTypes[typeIndex]` missing) or
 * not in `SEMANTIC_TOKEN_MAP` are silently skipped, matching the original
 * vscode implementation.
 */
export function mapTokensToDecorations(
  tokens: SemanticTokens,
  zone: InjectionZone,
  rangesByCategory: Map<DecorationCategory, InjectionRange[]>,
): void {
  const { legend, data } = tokens;
  let line = 0;
  let startChar = 0;

  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaStart = data[i + 1];
    const length = data[i + 2];
    const typeIndex = data[i + 3];

    if (deltaLine > 0) {
      line += deltaLine;
      startChar = deltaStart;
    } else {
      startChar += deltaStart;
    }

    const tokenTypeName = legend.tokenTypes[typeIndex];
    if (!tokenTypeName) continue;

    const category = SEMANTIC_TOKEN_MAP[tokenTypeName];
    if (!category) continue;

    const ranges = rangesByCategory.get(category);
    if (!ranges) continue;

    // Virtual-doc position → real-doc position.
    // Line 0 of the virtual doc starts at column `zone.startCol` in the
    // real doc; subsequent lines start at column 0.
    const realLine = zone.startRow + line;
    const realStartChar = line === 0 ? zone.startCol + startChar : startChar;

    ranges.push({
      startLine: realLine,
      startCol: realStartChar,
      endLine: realLine,
      endCol: realStartChar + length,
    });
  }
}
