export interface SnippetInsertionPayload {
  text: string
  cursorOffset: number
}

export function isSnippetInsertionPayload(value: unknown): value is SnippetInsertionPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { text?: unknown }).text === 'string' &&
    typeof (value as { cursorOffset?: unknown }).cursorOffset === 'number'
  )
}

export interface InsertSnippetResult {
  textToInsert: string
  prefix: string
  suffix: string
  newCursorOffset: number
}

export function calculateSnippetInsertion(
  payload: SnippetInsertionPayload,
  currentLineNumber: number,
  currentColumn: number,
  currentOffset: number
): InsertSnippetResult {
  const prefix = currentLineNumber === 1 && currentColumn === 1 ? '' : '\n'
  const suffix = '\n'
  const textToInsert = `${prefix}${payload.text}${suffix}`
  const newCursorOffset = currentOffset + prefix.length + payload.cursorOffset

  return {
    textToInsert,
    prefix,
    suffix,
    newCursorOffset
  }
}

// ============================================================================
// Smart paste (lex/preparePaste) — lex#708, lexed#136
// ============================================================================

/**
 * The classification that the server assigns to a paste. Informational for the editor
 * glue — every mode is applied identically, as a single replacement edit over
 * the paste range using {@link PreparePasteResponse.text}. The mode is carried
 * for logging / future divergence only.
 */
export type PreparePasteMode =
  | 're-anchor'
  | 'passthrough-verbatim'
  | 'passthrough-table'
  | 'passthrough-single-line'

const PREPARE_PASTE_MODES: ReadonlySet<string> = new Set<PreparePasteMode>([
  're-anchor',
  'passthrough-verbatim',
  'passthrough-table',
  'passthrough-single-line'
])

/**
 * Response shape of the `lex/preparePaste` request. The server returns `null`
 * when it declines to transform (the caller then performs a native paste); a
 * non-null response always carries the `text` to apply over the paste range.
 */
export interface PreparePasteResponse {
  mode: PreparePasteMode
  text: string
}

export function isPreparePasteResponse(value: unknown): value is PreparePasteResponse {
  if (typeof value !== 'object' || value === null) return false
  const { text, mode } = value as { text?: unknown; mode?: unknown }
  return typeof text === 'string' && typeof mode === 'string' && PREPARE_PASTE_MODES.has(mode)
}

/** 1-indexed line/column, matching Monaco's position convention. */
export interface PasteEndPosition {
  lineNumber: number
  column: number
}

/**
 * Compute the caret position after inserting `text` at the 1-indexed
 * (`startLine`, `startColumn`). Mirrors native paste: the cursor lands at the
 * end of the inserted block, with nothing selected. Single-line text advances
 * the column; multi-line text moves to the last line, where the column is the
 * trailing segment length + 1 (column is 1-indexed).
 */
export function computePasteEndPosition(
  text: string,
  startLine: number,
  startColumn: number
): PasteEndPosition {
  const newlineCount = (text.match(/\n/g) ?? []).length
  if (newlineCount === 0) {
    return { lineNumber: startLine, column: startColumn + text.length }
  }
  const lastSegment = text.slice(text.lastIndexOf('\n') + 1)
  return { lineNumber: startLine + newlineCount, column: lastSegment.length + 1 }
}
