import * as monaco from 'monaco-editor'
import { lspClient } from '@lex-fmt/lex-buffer'
import {
  isSnippetInsertionPayload,
  calculateSnippetInsertion,
  isPreparePasteResponse,
  computePasteEndPosition,
  type SnippetInsertionPayload,
} from '@/lib/editing'

async function invokeInsertCommand(
  editor: monaco.editor.IStandaloneCodeEditor,
  command: string,
  args: unknown[]
): Promise<void> {
  const model = editor.getModel()
  if (!model) return

  const position = editor.getPosition()
  if (!position) return

  try {
    const response = await lspClient.sendRequest<SnippetInsertionPayload>(
      'workspace/executeCommand',
      {
        command,
        arguments: [
          model.uri.toString(),
          { line: position.lineNumber - 1, character: position.column - 1 },
          ...args,
        ],
      }
    )

    if (response && isSnippetInsertionPayload(response)) {
      console.log('invokeInsertCommand: received snippet payload', response)
      insertSnippet(editor, position, response)
    } else {
      console.error('Invalid snippet payload received', response)
    }
  } catch (error) {
    console.error(`Failed to execute ${command}:`, error)
    throw error
  }
}

function insertSnippet(
  editor: monaco.editor.IStandaloneCodeEditor,
  position: monaco.Position,
  payload: SnippetInsertionPayload
) {
  const model = editor.getModel()
  if (!model) return

  const startOffset = model.getOffsetAt(position)

  const { textToInsert, newCursorOffset } = calculateSnippetInsertion(
    payload,
    position.lineNumber,
    position.column,
    startOffset
  )

  editor.executeEdits('lex-insert', [
    {
      range: new monaco.Range(
        position.lineNumber,
        position.column,
        position.lineNumber,
        position.column
      ),
      text: textToInsert,
      forceMoveMarkers: true,
    },
  ])

  const newPosition = model.getPositionAt(newCursorOffset)

  editor.setSelection(
    new monaco.Selection(
      newPosition.lineNumber,
      newPosition.column,
      newPosition.lineNumber,
      newPosition.column
    )
  )
  editor.revealPosition(newPosition)
}

export async function insertAsset(editor: monaco.editor.IStandaloneCodeEditor, assetPath: string) {
  console.log('insertAsset called with', assetPath)
  await invokeInsertCommand(editor, 'lex.insert_asset', [assetPath])
}

export async function insertVerbatim(
  editor: monaco.editor.IStandaloneCodeEditor,
  filePath: string
) {
  await invokeInsertCommand(editor, 'lex.insert_verbatim', [filePath])
}

export async function resolveAnnotation(editor: monaco.editor.IStandaloneCodeEditor) {
  await invokeInsertCommand(editor, 'lex.resolve_annotation', [])
}

export async function toggleAnnotations(editor: monaco.editor.IStandaloneCodeEditor) {
  await invokeInsertCommand(editor, 'lex.toggle_annotations', [])
}

// ============================================================================
// Extract-to-include (lex#497)
// ============================================================================

interface LspPosition {
  line: number
  character: number
}
interface LspRange {
  start: LspPosition
  end: LspPosition
}
interface LspTextEdit {
  range: LspRange
  newText: string
}
type LspDocumentChange =
  | { kind: 'create'; uri: string; options?: { overwrite?: boolean; ignoreIfExists?: boolean } }
  | { textDocument: { uri: string; version: number | null }; edits: LspTextEdit[] }

interface LspWorkspaceEdit {
  documentChanges?: LspDocumentChange[]
}

function fsPathFromUri(uri: string): string {
  // Convert `file://` URIs to platform-native paths. On Windows, a URI like
  // `file:///C:/Users/foo` has `pathname == "/C:/Users/foo"` — passing that
  // verbatim to `fs.writeFile` fails because of the leading slash before
  // the drive letter. Strip it on win32.
  const url = new URL(uri)
  if (url.protocol !== 'file:') {
    throw new Error(`Cannot apply edit to non-file URI: ${uri}`)
  }
  let path = decodeURIComponent(url.pathname)
  if (
    typeof window !== 'undefined' &&
    window.navigator &&
    window.navigator.platform &&
    window.navigator.platform.startsWith('Win') &&
    /^\/[A-Za-z]:/.test(path)
  ) {
    path = path.slice(1)
  }
  return path
}

/**
 * Apply a WorkspaceEdit returned by `lex.extractToInclude`. The server
 * produces a three-op sequence:
 *   1. `CreateFile` for the new include target.
 *   2. `TextDocumentEdit` writing the indent-shifted selection into it.
 *   3. `TextDocumentEdit` replacing the host selection with the include
 *      annotation.
 *
 * Op 3 lands as a Monaco edit on the active editor (its URI matches the
 * model). Ops 1+2 land as a single `file-save` IPC — fewer round-trips
 * than separate "create then write" calls, and matches what the server
 * expects (the CreateFile op is a marker; the content always arrives via
 * the paired TextDocumentEdit at position (0,0)).
 */
async function applyExtractWorkspaceEdit(
  editor: monaco.editor.IStandaloneCodeEditor,
  edit: LspWorkspaceEdit
): Promise<void> {
  const model = editor.getModel()
  if (!model) {
    throw new Error('No active editor model')
  }
  const ops = edit.documentChanges ?? []
  if (ops.length === 0) {
    throw new Error('Workspace edit had no operations')
  }

  const hostUri = model.uri.toString()
  // Collect file-creation targets so we can pair them with their content edits.
  const createTargets = new Set<string>()
  for (const op of ops) {
    if ('kind' in op && op.kind === 'create') {
      createTargets.add(op.uri)
    }
  }

  for (const op of ops) {
    if ('kind' in op && op.kind === 'create') {
      // Defer the on-disk write until we see the paired TextDocumentEdit
      // that carries the content. The server always emits both in order.
      continue
    }
    if (!('textDocument' in op)) continue
    const { uri } = op.textDocument

    if (uri === hostUri) {
      // Replace the selection in the active editor.
      const monacoEdits = op.edits.map((e) => ({
        range: new monaco.Range(
          e.range.start.line + 1,
          e.range.start.character + 1,
          e.range.end.line + 1,
          e.range.end.character + 1
        ),
        text: e.newText,
        forceMoveMarkers: true,
      }))
      editor.executeEdits('lex-extract-to-include', monacoEdits)
      continue
    }
    // Target file: write content via IPC. The matching CreateFile op is
    // implicit — `fileSave` creates parents-must-exist semantics, which
    // is fine because the server's validator already enforced parent-dir
    // existence (ExtractError::ParentDirMissing).
    if (!createTargets.has(uri)) {
      throw new Error(`Refusing to write a non-host URI without a CreateFile op: ${uri}`)
    }
    // The server contract for a newly-created file is exactly one edit
    // inserting the full content at (0,0). Collapsing `op.edits` via
    // `map(...).join('')` would lose ordering if that ever changed, so
    // assert the shape up front rather than silently producing wrong
    // content. If we need to support multi-edit creates later, this
    // throw forces a deliberate update of the apply path (LSP TextEdit[]
    // base semantics, base-then-apply ordering).
    if (op.edits.length !== 1) {
      throw new Error(`Expected a single content edit for new file ${uri}, got ${op.edits.length}`)
    }
    const contentEdit = op.edits[0]
    if (
      contentEdit.range.start.line !== 0 ||
      contentEdit.range.start.character !== 0 ||
      contentEdit.range.end.line !== 0 ||
      contentEdit.range.end.character !== 0
    ) {
      throw new Error(
        `Expected new-file edit range to be (0,0)-(0,0), got ${JSON.stringify(contentEdit.range)}`
      )
    }
    await window.ipcRenderer.invoke('file-save', fsPathFromUri(uri), contentEdit.newText)
  }
}

export async function extractToInclude(
  editor: monaco.editor.IStandaloneCodeEditor,
  src: string
): Promise<void> {
  const model = editor.getModel()
  if (!model) throw new Error('No active editor model')

  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    throw new Error('Select some text before running extract-to-include')
  }

  // Convert Monaco's 1-indexed range to LSP's 0-indexed range.
  const range: LspRange = {
    start: {
      line: selection.startLineNumber - 1,
      character: selection.startColumn - 1,
    },
    end: {
      line: selection.endLineNumber - 1,
      character: selection.endColumn - 1,
    },
  }

  const response = await lspClient.sendRequest<LspWorkspaceEdit | null>(
    'workspace/executeCommand',
    {
      command: 'lex.extractToInclude',
      arguments: [model.uri.toString(), range, src],
    }
  )
  if (!response) throw new Error('Extract returned an empty response')
  await applyExtractWorkspaceEdit(editor, response)
}

// ============================================================================
// Smart paste (lex#708, lexed#136)
// ============================================================================

/** Experimental capability flag advertised by a server implementing the request. */
export const PREPARE_PASTE_CAPABILITY = 'lexPreparePaste'

/**
 * Whether the connected server can transform pastes. The paste interceptor
 * checks this before intercepting so that — against an older server, or before
 * the LSP has initialized — paste falls through to Monaco's native handler.
 */
export function isSmartPasteAvailable(): boolean {
  return lspClient.hasExperimentalCapability(PREPARE_PASTE_CAPABILITY)
}

/**
 * Route a paste through `lex/preparePaste` and apply the transformed text as a
 * single replacement edit over `pasteRange`.
 *
 * Returns `true` when the server transformed the paste and the edit was
 * applied; returns `false` when the caller should perform a native paste
 * instead (server declined with `null`, returned a malformed payload, or the
 * request failed). The caller owns the native fallback so this function never
 * throws for the common "not handled" path.
 *
 * `pasteRange` is the Monaco range the pasted text would occupy — the current
 * selection for a replace-paste, or an empty range at the caret for an insert.
 */
export async function applySmartPaste(
  editor: monaco.editor.IStandaloneCodeEditor,
  pasteRange: monaco.IRange,
  pastedText: string
): Promise<boolean> {
  const model = editor.getModel()
  if (!model) return false

  // Convert Monaco's 1-indexed range to LSP's 0-indexed range.
  const range: LspRange = {
    start: {
      line: pasteRange.startLineNumber - 1,
      character: pasteRange.startColumn - 1,
    },
    end: {
      line: pasteRange.endLineNumber - 1,
      character: pasteRange.endColumn - 1,
    },
  }

  let response: unknown
  try {
    response = await lspClient.sendRequest<unknown>('lex/preparePaste', {
      textDocument: { uri: model.uri.toString() },
      range,
      pastedText,
    })
  } catch (error) {
    console.error('lex/preparePaste failed; falling back to native paste', error)
    return false
  }

  if (!isPreparePasteResponse(response)) {
    // `null` (server declined) or a malformed payload — let the host paste.
    return false
  }

  // The request is async; bail if the active model changed in flight (e.g.
  // the user switched tabs) so we never write the transformed text into the
  // wrong document. Reporting `false` here is safe: the paste range no longer
  // refers to this editor's content, so a native fallback would be wrong too
  // — the caller simply drops the stale paste.
  if (editor.getModel() !== model) return false

  // Collapse the selection to the end of the inserted text, matching native
  // paste behavior (cursor after the pasted block, nothing selected). Passed
  // as `endCursorState` because `executeEdits` leaves the selection untouched
  // otherwise. Wrapped so a throw applying the edit (e.g. editor disposed
  // mid-flight) reports `false` rather than rejecting — the interceptor has
  // already prevented the native paste, so a rejection here would lose it.
  try {
    const end = computePasteEndPosition(
      response.text,
      pasteRange.startLineNumber,
      pasteRange.startColumn
    )
    editor.executeEdits(
      'lex-smart-paste',
      [
        {
          range: new monaco.Range(
            pasteRange.startLineNumber,
            pasteRange.startColumn,
            pasteRange.endLineNumber,
            pasteRange.endColumn
          ),
          text: response.text,
          forceMoveMarkers: true,
        },
      ],
      [new monaco.Selection(end.lineNumber, end.column, end.lineNumber, end.column)]
    )
    editor.pushUndoStop()
  } catch (error) {
    console.error('Failed to apply smart-paste edit; falling back to native paste', error)
    return false
  }
  return true
}

/**
 * Install the smart-paste interceptor on a Monaco editor and return a
 * disposer. Listens at the editor's DOM surface (capture phase, before
 * Monaco's own paste handling) and, for a plain-text paste into a `.lex`
 * buffer while the server advertises the capability, routes the clipboard
 * text through {@link applySmartPaste}. Anything else — non-`.lex` buffer,
 * capability absent, non-text clipboard payload, or a server that declines —
 * falls through to Monaco's native paste untouched.
 */
export function installSmartPasteInterceptor(
  editor: monaco.editor.IStandaloneCodeEditor
): () => void {
  const node = editor.getContainerDomNode()

  const onPaste = (event: ClipboardEvent) => {
    const model = editor.getModel()
    if (!model || model.getLanguageId() !== 'lex') return
    if (!isSmartPasteAvailable()) return

    const clipboard = event.clipboardData
    if (!clipboard) return
    // Only intercept *plain-text-only* pastes. If the clipboard advertises any
    // richer type alongside `text/plain` (e.g. `text/html`, files, images),
    // leave the whole paste to Monaco / the platform so rich handling isn't
    // clobbered. An empty/unknown type list is treated as plain text.
    const types = Array.from(clipboard.types ?? [])
    if (types.some((t) => t !== 'text/plain')) return
    const pastedText = clipboard.getData('text/plain')
    if (!pastedText) return

    const selection = editor.getSelection()
    if (!selection) return

    // We are handling this paste — stop Monaco's native handler. If the
    // server later declines, we replay a native paste of the same text so
    // the user never loses the paste.
    event.preventDefault()
    event.stopPropagation()

    const pasteRange: monaco.IRange = {
      startLineNumber: selection.startLineNumber,
      startColumn: selection.startColumn,
      endLineNumber: selection.endLineNumber,
      endColumn: selection.endColumn,
    }

    void applySmartPaste(editor, pasteRange, pastedText).then((handled) => {
      if (!handled) {
        // Bail if the active model changed while the request was in flight
        // (e.g. tab switch) — applying the fallback would corrupt the wrong
        // document.
        if (editor.getModel() !== model) return
        // Native fallback: replace the (possibly stale) range with the
        // literal clipboard text. Re-read the live selection in case the
        // selection moved within the same model while the request was in
        // flight.
        const live = editor.getSelection() ?? pasteRange
        const end = computePasteEndPosition(pastedText, live.startLineNumber, live.startColumn)
        editor.executeEdits(
          'lex-smart-paste-fallback',
          [
            {
              range: new monaco.Range(
                live.startLineNumber,
                live.startColumn,
                live.endLineNumber,
                live.endColumn
              ),
              text: pastedText,
              forceMoveMarkers: true,
            },
          ],
          [new monaco.Selection(end.lineNumber, end.column, end.lineNumber, end.column)]
        )
        editor.pushUndoStop()
      }
    })
  }

  node.addEventListener('paste', onPaste, true)
  return () => node.removeEventListener('paste', onPaste, true)
}
