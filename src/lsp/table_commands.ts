import * as monaco from 'monaco-editor'
import { lspClient } from './client'

interface TableNavOutcome {
  inTable: boolean
  position: { line: number; column: number } | null
}

interface TableFormatResult {
  start: number
  end: number
  newText: string
}

// Per-editor guard so a second Tab/Shift+Tab press while a previous
// LSP request is still in flight can't let two responses race each
// other — the second one would clobber the cursor set by the first.
// WeakMap so editors that get disposed aren't leaked.
const pendingNav = new WeakMap<monaco.editor.IStandaloneCodeEditor, boolean>()

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8')

/**
 * Translate a UTF-8 byte offset (as emitted by `lex.table.format`) into a
 * UTF-16 code-unit offset, which is what Monaco's `model.getPositionAt`
 * expects. For pure-ASCII documents these coincide; for anything with
 * multi-byte characters they diverge and edits would land in the wrong
 * place without this conversion.
 */
function byteOffsetToCharOffset(source: string, byteOffset: number): number {
  if (byteOffset <= 0) return 0
  const bytes = textEncoder.encode(source)
  if (byteOffset >= bytes.length) return source.length
  const prefix = textDecoder.decode(bytes.slice(0, byteOffset))
  return prefix.length
}

/**
 * Navigate between pipe-delimited table cells via the LSP.
 *
 * Returns `true` iff the LSP decided the cursor is inside a table — the
 * caller should treat that as "handled" and suppress the default Tab
 * behaviour. `false` means the cursor is not on a pipe row, and Monaco's
 * default Tab / outdent should be allowed to run.
 *
 * The LSP's `{ inTable, position? }` contract maps as follows:
 * - `inTable = false` → return `false` (fall through).
 * - `inTable = true, position = { line, column }` → move the cursor there.
 * - `inTable = true, position = null` → we're on a pipe row but no valid
 *   move exists (single-column row, table edge); still return `true` so
 *   the Tab is consumed rather than inserting whitespace in a table.
 *
 * Before talking to the LSP we short-circuit on non-pipe lines locally,
 * both to avoid the round-trip on every Tab press and because a typical
 * response of "not in a table" would be the common case.
 */
export async function navigateTableCell(
  editor: monaco.editor.IStandaloneCodeEditor,
  direction: 'next' | 'previous'
): Promise<boolean> {
  const model = editor.getModel()
  if (!model || model.getLanguageId() !== 'lex') {
    return false
  }

  const position = editor.getPosition()
  if (!position) {
    return false
  }

  const lineText = model.getLineContent(position.lineNumber)
  if (!lineText.trimStart().startsWith('|')) {
    return false
  }

  // Drop this request if a previous one is still in flight. Two pending
  // LSP round-trips could resolve out of order and clobber the cursor.
  if (pendingNav.get(editor)) {
    return true
  }

  const command = direction === 'next' ? 'lex.table.next_cell' : 'lex.table.previous_cell'

  pendingNav.set(editor, true)
  let outcome: TableNavOutcome | null
  try {
    outcome = await lspClient.sendRequest<TableNavOutcome | null>('workspace/executeCommand', {
      command,
      arguments: [model.getValue(), position.lineNumber - 1, position.column - 1],
    })
  } catch (err) {
    console.error(`[LSP] ${command} failed:`, err)
    return false
  } finally {
    pendingNav.delete(editor)
  }

  if (!outcome || !outcome.inTable) {
    return false
  }

  if (outcome.position) {
    editor.setPosition({
      lineNumber: outcome.position.line + 1,
      column: outcome.position.column + 1,
    })
  }
  return true
}

/**
 * Format the table under the cursor via `lex.table.format`. Applies the
 * returned byte-range replacement to the model in a single undo step.
 */
export async function formatTableAtCursor(
  editor: monaco.editor.IStandaloneCodeEditor
): Promise<boolean> {
  const model = editor.getModel()
  if (!model || model.getLanguageId() !== 'lex') {
    return false
  }

  const position = editor.getPosition()
  if (!position) {
    return false
  }

  let result: TableFormatResult | null
  try {
    result = await lspClient.sendRequest<TableFormatResult | null>('workspace/executeCommand', {
      command: 'lex.table.format',
      arguments: [model.getValue(), position.lineNumber - 1, position.column - 1],
    })
  } catch (err) {
    console.error('[LSP] lex.table.format failed:', err)
    return false
  }

  if (!result) {
    return false
  }

  const content = model.getValue()
  // `lex.table.format` returns UTF-8 byte offsets; convert them to the
  // UTF-16 code-unit offsets Monaco expects. For ASCII-only documents
  // the two coincide; this matters for tables containing non-ASCII
  // characters (em dashes, accented letters, CJK, …).
  const startOffset = byteOffsetToCharOffset(content, result.start)
  const endOffset = byteOffsetToCharOffset(content, result.end)
  const startPos = model.getPositionAt(startOffset)
  const endPos = model.getPositionAt(endOffset)

  const range = new monaco.Range(
    startPos.lineNumber,
    startPos.column,
    endPos.lineNumber,
    endPos.column
  )

  editor.pushUndoStop()
  editor.executeEdits('lex-format-table', [{ range, text: result.newText }])
  editor.pushUndoStop()
  return true
}
