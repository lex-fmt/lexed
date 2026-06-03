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
    newCursorOffset,
  }
}

// ============================================================================
// Smart paste (lex/preparePaste) — lex#708, lexed#136
// ============================================================================

/**
 * Classification the server assigns to a paste. Informational for the editor
 * glue — every mode is applied identically, as a single replacement edit over
 * the paste range using {@link PreparePasteResponse.text}. The mode is carried
 * for logging / future divergence only.
 */
export type PreparePasteMode =
  | 're-anchor'
  | 'passthrough-verbatim'
  | 'passthrough-table'
  | 'passthrough-single-line'

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
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { text?: unknown }).text === 'string' &&
    typeof (value as { mode?: unknown }).mode === 'string'
  )
}
