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

  const command = direction === 'next' ? 'lex.table.next_cell' : 'lex.table.previous_cell'

  let outcome: TableNavOutcome | null = null
  try {
    outcome = await lspClient.sendRequest<TableNavOutcome | null>('workspace/executeCommand', {
      command,
      arguments: [model.getValue(), position.lineNumber - 1, position.column - 1],
    })
  } catch (err) {
    console.error(`[LSP] ${command} failed:`, err)
    return false
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

  let result: TableFormatResult | null = null
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
  const startOffset = Math.min(result.start, content.length)
  const endOffset = Math.min(result.end, content.length)
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
