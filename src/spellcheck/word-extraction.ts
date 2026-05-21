/**
 * Extract checkable words from a Lex document.
 *
 * Spell-check policy (mirrors tree-sitter-lex/queries/highlights.scm):
 *   - All prose is checked: document title, session titles, paragraphs,
 *     list items, definition subjects, table cells, verbatim subjects,
 *     and annotation block bodies.
 *   - The trailing descriptor after `:: label :: <text>` is checked.
 *   - The annotation header (label + params, between `::` markers) is not.
 *   - Verbatim block bodies are not (they hold code/preformatted text).
 *   - Inline code (`...`), inline math (#...#), references ([...]),
 *     URLs, and file paths are not.
 *
 * Block detection is a two-pass scan: pass 1 classifies each line by its
 * structural role (subject / annotation open / annotation close / verbatim
 * close / single annotation / prose) using one-line lookahead at the next
 * non-blank line. Pass 2 walks the classifications, maintains a block
 * frame stack, and emits a per-line spell decision plus the byte range
 * to scan for words.
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

const WORD_RE = /[a-zA-ZÀ-ɏЀ-ӿ](?:[a-zA-ZÀ-ɏЀ-ӿ']*[a-zA-ZÀ-ɏЀ-ӿ])?/g

type LineClass =
  | { kind: 'blank' }
  /** `:: label … ::` with nothing after the closer; opens an annotation block (or verbatim closer) */
  | { kind: 'colon_marker_only'; indent: number }
  /** `:: label … :: trailing text` — single annotation; trailing portion is prose */
  | { kind: 'colon_marker_with_trailing'; indent: number; trailingStart: number }
  /** Bare `::` — annotation block closer */
  | { kind: 'colon_close'; indent: number }
  /** A line ending in `:` where the next non-blank line is more indented — subject opener */
  | { kind: 'subject_with_body'; indent: number; bodyIndent: number }
  /** Any other line — prose by default; final spell decision depends on stack */
  | { kind: 'prose'; indent: number }

interface BlockFrame {
  /** Whether prose inside this frame's body should be spell-checked */
  spell: boolean
  /** Indent level of the opener (in tab-stops) — useful for disambiguating
   * an explicit closer at the same level. */
  openerIndent: number
  /** Indent level of body lines (one greater than the opener's own indent) */
  bodyIndent: number
}

// Per `welcome/general.lex` (§ Indentation): one indent step = `tabStop`
// spaces (default 4). Tabs are not recommended but count as `tabStop`
// spaces when present. We return the indent level in tab-stops; only the
// floor matters for structural comparisons.
const TAB_STOP = 4

function indentOf(line: string): number {
  let cols = 0
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\t') cols += TAB_STOP
    else if (ch === ' ') cols += 1
    else break
  }
  return Math.floor(cols / TAB_STOP)
}

function findNextNonBlank(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i++) {
    if (lines[i].trim() !== '') return i
  }
  return -1
}

// `:: label :: …`. Captures the column where the trailing portion begins
// (one past the closing `::`). Returns null if the line isn't `::`-prefixed.
// Accepts tabs or spaces for leading indentation.
function matchColonMarker(
  line: string
): { indent: number; trailingStart: number; trailing: string } | null {
  // ^ <ws>? :: <ws> <header (non-greedy, allows single colons)> <ws> :: <rest?>
  const m = line.match(/^([ \t]*)(::[ \t]+(?:[^:\n]|:[^:\n])+[ \t]+::)(.*)$/)
  if (!m) return null
  const indent = indentOf(line)
  const trailingStart = m[1].length + m[2].length
  return { indent, trailingStart, trailing: m[3] }
}

function classifyLine(lines: string[], i: number): LineClass {
  const line = lines[i]
  const trimmed = line.trim()
  if (trimmed === '') return { kind: 'blank' }

  const indent = indentOf(line)

  if (trimmed === '::') {
    return { kind: 'colon_close', indent }
  }

  const marker = matchColonMarker(line)
  if (marker) {
    if (marker.trailing.trim() !== '') {
      return { kind: 'colon_marker_with_trailing', indent, trailingStart: marker.trailingStart }
    }
    return { kind: 'colon_marker_only', indent }
  }

  // Subject line: ends with `:` (and is not a `::`-prefixed line, handled above).
  if (/:\s*$/.test(trimmed)) {
    const nextIdx = findNextNonBlank(lines, i + 1)
    if (nextIdx !== -1) {
      const nextIndent = indentOf(lines[nextIdx])
      if (nextIndent > indent) {
        return { kind: 'subject_with_body', indent, bodyIndent: nextIndent }
      }
    }
    // Subject-shaped line with no indented body — treat as prose (might be
    // a paragraph that happens to end in a colon).
    return { kind: 'prose', indent }
  }

  return { kind: 'prose', indent }
}

// Heuristic: a subject line followed by indented body opens a *verbatim*
// block only when there is a matching `:: label ::` closer at the same
// indent farther down. Otherwise the indented body is a definition body
// (and definitions are prose).
function findVerbatimCloser(
  lines: string[],
  classes: LineClass[],
  startIdx: number,
  subjectIndent: number
): number {
  for (let j = startIdx; j < lines.length; j++) {
    const c = classes[j]
    if (c.kind === 'blank') continue
    // Bail once we've dedented past the subject — no closer at this scope.
    if ('indent' in c && c.indent < subjectIndent) return -1
    if (c.indent !== subjectIndent) continue
    // A marker-only `:: label ::` line at the subject's indent closes the
    // verbatim block. `:: label :: trailing` is a single annotation, not a
    // closer — falling through here lets the outer scan continue to the
    // real closer further down.
    if (c.kind === 'colon_marker_only') {
      return j
    }
    // A bare `::` at the subject's indent doesn't close a verbatim — it
    // closes an annotation block (which we shouldn't be inside here).
  }
  return -1
}

/**
 * Per-line spell decision: returns the column range [start, end) to feed
 * to the word extractor, or null if the line should be skipped entirely.
 * Column indices are 0-based UTF-16 code-unit offsets into `lines[i]`
 * (consistent with JavaScript string indexing and Monaco/LSP positions).
 */
function computeSpellRanges(
  lines: string[]
): Array<{ row: number; start: number; end: number } | null> {
  const classes = lines.map((_, i) => classifyLine(lines, i))
  const decisions: Array<{ row: number; start: number; end: number } | null> = new Array(
    lines.length
  ).fill(null)

  // Set of line indices that mark verbatim block boundaries (the `:: label ::`
  // closer of a verbatim). We resolve verbatim regions in a forward pre-pass
  // and store [bodyStart, bodyEnd] (inclusive of body lines, exclusive of
  // subject and closer).
  const verbatimBodyMask = new Uint8Array(lines.length)
  const verbatimCloserLines = new Set<number>()

  // First pass: resolve verbatim regions.
  for (let i = 0; i < lines.length; i++) {
    const c = classes[i]
    if (c.kind === 'subject_with_body') {
      const closer = findVerbatimCloser(lines, classes, i + 1, c.indent)
      if (closer !== -1) {
        // Lines (i+1 .. closer-1) are verbatim body.
        for (let j = i + 1; j < closer; j++) verbatimBodyMask[j] = 1
        verbatimCloserLines.add(closer)
      }
    }
  }

  // Second pass: walk with an annotation-block stack and emit decisions.
  const stack: BlockFrame[] = []

  for (let i = 0; i < lines.length; i++) {
    const c = classes[i]
    const line = lines[i]

    if (c.kind === 'blank') {
      continue
    }

    // Pop annotation frames that have ended by dedent.
    while (stack.length > 0 && 'indent' in c && c.indent < stack[stack.length - 1].bodyIndent) {
      stack.pop()
    }

    // Verbatim body: never spell-check.
    if (verbatimBodyMask[i]) continue

    // Verbatim closer: skip the line entirely (it's a `:: label ::` marker).
    if (verbatimCloserLines.has(i)) continue

    switch (c.kind) {
      case 'colon_close':
        // The dedent-driven `while` above already pops any frame whose
        // bodyIndent is greater than this line's indent — which is the
        // normal case (closer sits at the opener's indent, one less than
        // the body indent). No additional pop here, else nested blocks
        // close twice and the outer scope is lost prematurely.
        break

      case 'colon_marker_only': {
        // Annotation block opener (since verbatim closer is already handled
        // above). The body following will be spell-checked unless we're
        // nested inside a non-spell context (we don't have one currently —
        // annotation inside verbatim isn't supported by lex syntax).
        const nextIdx = findNextNonBlank(lines, i + 1)
        if (nextIdx !== -1 && indentOf(lines[nextIdx]) > c.indent) {
          stack.push({
            spell: stackTopSpell(stack),
            openerIndent: c.indent,
            bodyIndent: indentOf(lines[nextIdx]),
          })
        }
        // The opener line itself is just markers — skip words.
        break
      }

      case 'colon_marker_with_trailing': {
        // Single annotation with a trailing descriptor. The header region
        // is skipped; trailing portion is prose.
        if (stackTopSpell(stack)) {
          decisions[i] = { row: i, start: c.trailingStart, end: line.length }
        }
        break
      }

      case 'subject_with_body':
        // Subject is prose. Note: if findVerbatimCloser already promoted
        // this to a verbatim subject, we still want the subject text checked
        // (per policy). Verbatim suppression applies only to the body.
        if (stackTopSpell(stack)) {
          decisions[i] = { row: i, start: 0, end: line.length }
        }
        break

      case 'prose':
        if (stackTopSpell(stack)) {
          decisions[i] = { row: i, start: 0, end: line.length }
        }
        break
    }
  }

  return decisions
}

function stackTopSpell(stack: BlockFrame[]): boolean {
  return stack.length === 0 ? true : stack[stack.length - 1].spell
}

export function extractCheckableWords(text: string): CheckableWord[] {
  const lines = text.split('\n')
  const decisions = computeSpellRanges(lines)
  const out: CheckableWord[] = []

  for (let i = 0; i < lines.length; i++) {
    const dec = decisions[i]
    if (!dec) continue
    const line = lines[i]
    const segment = line.slice(dec.start, dec.end)
    const skip = buildInlineSkipMask(segment)
    for (const [s, e] of skipToRanges(skip, segment.length)) {
      const sub = segment.slice(s, e)
      WORD_RE.lastIndex = 0
      let m
      while ((m = WORD_RE.exec(sub)) !== null) {
        const wordStart = dec.start + s + m.index
        out.push({
          text: m[0],
          startLine: i + 1,
          startColumn: wordStart + 1,
          endLine: i + 1,
          endColumn: wordStart + m[0].length + 1,
        })
      }
    }
  }

  return out
}

function buildInlineSkipMask(segment: string): Uint8Array {
  const skip = new Uint8Array(segment.length)
  markDelimitedSpans(segment, '`', '`', skip)
  markDelimitedSpans(segment, '#', '#', skip)
  markDelimitedSpans(segment, '[', ']', skip)

  // URLs
  const urlRe = /https?:\/\/\S+|ftp:\/\/\S+/g
  let m
  while ((m = urlRe.exec(segment)) !== null) {
    for (let j = m.index; j < m.index + m[0].length; j++) skip[j] = 1
  }

  // File paths
  const pathRe = /(?:\.\.?\/|\/)[^\s,;:!?)}\]]+/g
  while ((m = pathRe.exec(segment)) !== null) {
    for (let j = m.index; j < m.index + m[0].length; j++) skip[j] = 1
  }

  return skip
}

function skipToRanges(skip: Uint8Array, len: number): [number, number][] {
  const ranges: [number, number][] = []
  let start = -1
  for (let i = 0; i <= len; i++) {
    if (i < len && !skip[i]) {
      if (start === -1) start = i
    } else {
      if (start !== -1) {
        ranges.push([start, i])
        start = -1
      }
    }
  }
  return ranges
}

function markDelimitedSpans(line: string, open: string, close: string, skip: Uint8Array): void {
  let i = 0
  while (i < line.length) {
    if (line[i] === open) {
      const start = i
      i++
      if (open === close) {
        while (i < line.length && line[i] !== close) i++
        if (i < line.length) {
          for (let j = start; j <= i; j++) skip[j] = 1
          i++
        }
      } else {
        let depth = 1
        while (i < line.length && depth > 0) {
          if (line[i] === open) depth++
          else if (line[i] === close) depth--
          i++
        }
        for (let j = start; j < i; j++) skip[j] = 1
      }
    } else {
      i++
    }
  }
}
