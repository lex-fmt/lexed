/**
 * Extract checkable words from a Lex document.
 *
 * Knows enough about Lex structure to skip verbatim blocks, inline code,
 * math, references, URLs, and file paths. Everything else is prose.
 */

export interface CheckableWord {
  text: string
  /** 1-based line number */
  startLine: number
  /** 1-based column */
  startColumn: number
  /** 1-based line number */
  endLine: number
  /** 1-based column */
  endColumn: number
}

// Word boundary pattern: splits on whitespace, hyphens, and common
// punctuation, but keeps apostrophes within words. Hyphens act as
// separators so hyphenated tokens (e.g. `table-row`) are checked as
// their individual parts — dictionaries rarely carry compound forms.
const WORD_RE =
  /[a-zA-Z\u00C0-\u024F\u0400-\u04FF](?:[a-zA-Z\u00C0-\u024F\u0400-\u04FF'']*[a-zA-Z\u00C0-\u024F\u0400-\u04FF])?/g

/**
 * Extracts checkable words from Lex source text.
 *
 * Skips:
 * - Verbatim blocks (:: label :: ... ::)
 * - Inline code (`...`)
 * - Inline math ($...$)
 * - References ([...])
 * - URLs (http://, https://, ftp://)
 * - File paths (./..., ../..., /...)
 * - Session markers (indentation-based lines starting with content that
 *   forms the session title are still checked)
 */
export function extractCheckableWords(text: string): CheckableWord[] {
  const lines = text.split('\n')
  const words: CheckableWord[] = []
  let inVerbatim = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Detect verbatim block boundaries
    if (isVerbatimBoundary(trimmed)) {
      inVerbatim = !inVerbatim
      continue
    }

    if (inVerbatim) continue

    // Skip annotation headers (:: label ::) — these are structural
    if (/^::.*::$/.test(trimmed)) continue

    // Process the line, skipping inline regions that shouldn't be checked
    const checkableRanges = getCheckableRanges(line)

    for (const [start, end] of checkableRanges) {
      const segment = line.slice(start, end)
      WORD_RE.lastIndex = 0
      let match
      while ((match = WORD_RE.exec(segment)) !== null) {
        const wordStart = start + match.index
        words.push({
          text: match[0],
          startLine: i + 1,
          startColumn: wordStart + 1,
          endLine: i + 1,
          endColumn: wordStart + match[0].length + 1,
        })
      }
    }
  }

  return words
}

/**
 * Detect verbatim block opening/closing markers.
 * Opening: `:: label ::` possibly followed by attributes
 * Closing: `::` alone on a line
 */
function isVerbatimBoundary(trimmed: string): boolean {
  // Closing marker: just `::`
  if (trimmed === '::') return true
  // Opening marker: `:: word ::` or `:: word :: key=value`
  if (/^::[ \t]+\S.*::/.test(trimmed)) return true
  return false
}

/**
 * Returns ranges within a line that should be spellchecked,
 * excluding inline code, math, references, and URLs.
 */
function getCheckableRanges(line: string): [number, number][] {
  // Build a "skip mask" of character positions to exclude
  const skip = new Uint8Array(line.length)

  // Skip inline code: `...`
  markDelimitedSpans(line, '`', '`', skip)

  // Skip inline math: $...$
  markDelimitedSpans(line, '$', '$', skip)

  // Skip references: [...]
  markDelimitedSpans(line, '[', ']', skip)

  // Skip URLs
  const urlRe = /https?:\/\/\S+|ftp:\/\/\S+/g
  let m
  while ((m = urlRe.exec(line)) !== null) {
    for (let j = m.index; j < m.index + m[0].length; j++) {
      skip[j] = 1
    }
  }

  // Skip file paths: ./something, ../something, /something.ext
  const pathRe = /(?:\.\.?\/|\/)[^\s,;:!?)}\]]+/g
  while ((m = pathRe.exec(line)) !== null) {
    for (let j = m.index; j < m.index + m[0].length; j++) {
      skip[j] = 1
    }
  }

  // Convert skip mask to checkable ranges
  const ranges: [number, number][] = []
  let rangeStart = -1

  for (let i = 0; i <= line.length; i++) {
    if (i < line.length && !skip[i]) {
      if (rangeStart === -1) rangeStart = i
    } else {
      if (rangeStart !== -1) {
        ranges.push([rangeStart, i])
        rangeStart = -1
      }
    }
  }

  return ranges
}

/**
 * Mark spans delimited by open/close characters in the skip mask.
 */
function markDelimitedSpans(line: string, open: string, close: string, skip: Uint8Array): void {
  let i = 0
  while (i < line.length) {
    if (line[i] === open) {
      const start = i
      i++
      // For same-char delimiters (` and $), find the closing one
      if (open === close) {
        while (i < line.length && line[i] !== close) i++
        if (i < line.length) {
          // Found closing delimiter — mark the whole span
          for (let j = start; j <= i; j++) skip[j] = 1
          i++
        }
      } else {
        // Different delimiters ([ and ])
        let depth = 1
        while (i < line.length && depth > 0) {
          if (line[i] === open) depth++
          else if (line[i] === close) depth--
          i++
        }
        // Mark the whole span including delimiters
        for (let j = start; j < i; j++) skip[j] = 1
      }
    } else {
      i++
    }
  }
}
