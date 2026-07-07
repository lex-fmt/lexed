import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the LSP client so we can assert the request shape and drive the
// decline / error paths without a live server.
const sendRequest = vi.fn()
vi.mock('@lex-fmt/lex-buffer', () => ({
  lspClient: {
    sendRequest: (...args: unknown[]) => sendRequest(...args),
    hasExperimentalCapability: () => true
  }
}))

// `monaco-editor` is a heavy ESM module; stub the surface `editing.ts` uses
// (`Range` as a plain value object).
vi.mock('monaco-editor', () => ({
  Range: class {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number
    ) {}
  },
  Selection: class {
    constructor(
      public selectionStartLineNumber: number,
      public selectionStartColumn: number,
      public positionLineNumber: number,
      public positionColumn: number
    ) {}
  }
}))

import { applySmartPaste } from '../editing'

interface FakeEdit {
  range: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
  text: string
}

function makeEditor() {
  const edits: FakeEdit[][] = []
  let undoStops = 0
  let model: object = { uri: { toString: () => 'file:///doc.lex' } }
  const editor = {
    getModel: () => model,
    executeEdits: (_source: string, e: FakeEdit[]) => {
      edits.push(e)
      return true
    },
    pushUndoStop: () => {
      undoStops += 1
      return true
    }
  }
  return {
    editor: editor as unknown as Parameters<typeof applySmartPaste>[0],
    edits,
    undoStops: () => undoStops,
    swapModel: () => {
      model = { uri: { toString: () => 'file:///other.lex' } }
    }
  }
}

const RANGE = { startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 5 }

describe('applySmartPaste', () => {
  beforeEach(() => {
    sendRequest.mockReset()
  })

  it('sends lex/preparePaste with 0-indexed LSP positions', async () => {
    sendRequest.mockResolvedValue({ mode: 're-anchor', text: 'x' })
    const { editor } = makeEditor()

    await applySmartPaste(editor, RANGE, 'pasted')

    expect(sendRequest).toHaveBeenCalledWith('lex/preparePaste', {
      textDocument: { uri: 'file:///doc.lex' },
      // Monaco 1-indexed (2,5) → LSP 0-indexed (1,4)
      range: { start: { line: 1, character: 4 }, end: { line: 1, character: 4 } },
      pastedText: 'pasted'
    })
  })

  it('applies the returned text as a single replacement edit over the range', async () => {
    sendRequest.mockResolvedValue({ mode: 're-anchor', text: 'anchored\n  text' })
    const { editor, edits } = makeEditor()

    const handled = await applySmartPaste(editor, RANGE, 'raw')

    expect(handled).toBe(true)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toHaveLength(1)
    expect(edits[0][0].text).toBe('anchored\n  text')
    expect(edits[0][0].range).toMatchObject(RANGE)
  })

  it('returns false and applies no edit when the server declines (null)', async () => {
    sendRequest.mockResolvedValue(null)
    const { editor, edits } = makeEditor()

    const handled = await applySmartPaste(editor, RANGE, 'raw')

    expect(handled).toBe(false)
    expect(edits).toHaveLength(0)
  })

  it('returns false when the server returns a malformed payload', async () => {
    sendRequest.mockResolvedValue({ mode: 're-anchor' }) // no text
    const { editor, edits } = makeEditor()

    const handled = await applySmartPaste(editor, RANGE, 'raw')

    expect(handled).toBe(false)
    expect(edits).toHaveLength(0)
  })

  it('returns false (native fallback) when the request throws', async () => {
    sendRequest.mockRejectedValue(new Error('transport down'))
    const { editor, edits } = makeEditor()

    const handled = await applySmartPaste(editor, RANGE, 'raw')

    expect(handled).toBe(false)
    expect(edits).toHaveLength(0)
  })

  it('does not edit when the active model changed while in flight', async () => {
    const { editor, edits, swapModel } = makeEditor()
    // Swap the model when the request resolves, simulating a tab switch.
    sendRequest.mockImplementation(async () => {
      swapModel()
      return { mode: 're-anchor', text: 'x' }
    })

    const handled = await applySmartPaste(editor, RANGE, 'raw')

    expect(handled).toBe(false)
    expect(edits).toHaveLength(0)
  })
})
