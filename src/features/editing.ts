import * as monaco from 'monaco-editor'
import { lspClient } from '@lex-fmt/lex-buffer'
import {
  isSnippetInsertionPayload,
  calculateSnippetInsertion,
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
  // file:///abs/path -> /abs/path. Stay defensive for non-file URIs.
  const url = new URL(uri)
  if (url.protocol !== 'file:') {
    throw new Error(`Cannot apply edit to non-file URI: ${uri}`)
  }
  return decodeURIComponent(url.pathname)
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
    const newText = op.edits.map((e) => e.newText).join('')

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
    await window.ipcRenderer.invoke('file-save', fsPathFromUri(uri), newText)
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
