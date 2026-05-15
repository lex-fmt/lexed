import { test, expect, expectMarkers, waitForLsp } from './lib'
import { openFixture } from './helpers'

// The fixture mirrors vscode/test/fixtures/sample-workspace/documents/label-policy.lex
// and nvim/test/test_lsp_label_policy.lua's inline fixture line-for-line, so
// the three editor suites assert against the same source structure.
//
// 1-indexed lines (Monaco's convention):
//   4: `:: doc.table ::`              — forbidden, curated quickfix
//   9: `:: doc.unknownthing ::`        — forbidden, generic strip-fallback
//   12: `:: lex.notarealsemantic ::`   — unknown-lex-canonical
//   15: `:: title :: Example Doc`      — Shortcut form
//   17: `:: metadata.author :: Alice`  — Stripped form
//   19: `:: acme.task :: ...`          — Community form
const DOC_TABLE_LINE = 4
const DOC_UNKNOWNTHING_LINE = 9
const LEX_NOTREAL_LINE = 12

interface LspDiagnostic {
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  severity?: number
  code?: string | number
  source?: string
  message?: string
}

interface LspMarkupContent {
  kind?: string
  value: string
}

interface LspHover {
  contents?: string | LspMarkupContent | Array<string | LspMarkupContent>
}

interface LspCodeAction {
  title: string
  kind?: string
  edit?: {
    changes?: Record<string, Array<{ range: unknown; newText: string }>>
  }
  command?: { command: string; arguments?: unknown[] }
}

function unwrapHoverText(hover: LspHover | null | undefined): string {
  if (!hover?.contents) return ''
  const contents = hover.contents
  if (typeof contents === 'string') return contents
  if (Array.isArray(contents)) {
    return contents.map((c) => (typeof c === 'string' ? c : c.value)).join('\n')
  }
  return contents.value ?? ''
}

test.describe('Label policy', () => {
  test('diagnostics surface for doc.* and unknown lex.* labels', async ({ page }) => {
    await openFixture(page, 'label-policy.lex')
    await waitForLsp(page)

    await expectMarkers(page, [
      {
        message: 'doc.table',
        severity: 'error',
        startLineNumber: DOC_TABLE_LINE,
        source: 'lex',
      },
      {
        message: 'doc.unknownthing',
        severity: 'error',
        startLineNumber: DOC_UNKNOWNTHING_LINE,
        source: 'lex',
      },
      {
        message: 'lex.notarealsemantic',
        severity: 'error',
        startLineNumber: LEX_NOTREAL_LINE,
        source: 'lex',
      },
    ])
  })

  test('quickfix rewrites :: doc.table :: to :: table ::', async ({ page }) => {
    await openFixture(page, 'label-policy.lex')
    await waitForLsp(page)

    // `publishDiagnostics` arrives async after `didOpen`, so reading
    // markers immediately can race the server. Poll until the marker
    // we need is present, then build the code-action request from it.
    // Monaco's `MarkerSeverity.Error === 8` doesn't match LSP's
    // `DiagnosticSeverity.Error === 1`; map back so the diagnostic we
    // send to the server matches a real client-emitted one.
    const MONACO_TO_LSP_SEVERITY: Record<number, number> = { 8: 1, 4: 2, 2: 3, 1: 4 }
    const diagnostic = await expect
      .poll(
        () =>
          page.evaluate((line) => {
            const markers = window.__e2e.bridge?.getMarkers?.() ?? []
            const marker = markers.find(
              (m: { startLineNumber: number; message: string; source: string }) =>
                m.startLineNumber === line && m.message.includes('doc.table') && m.source === 'lex'
            ) as
              | {
                  startLineNumber: number
                  startColumn: number
                  endLineNumber: number
                  endColumn: number
                  severity: number
                  code?: string | number
                  source: string
                  message: string
                }
              | undefined
            if (!marker) return null
            return {
              range: {
                start: { line: marker.startLineNumber - 1, character: marker.startColumn - 1 },
                end: { line: marker.endLineNumber - 1, character: marker.endColumn - 1 },
              },
              monacoSeverity: marker.severity,
              code: marker.code,
              source: marker.source,
              message: marker.message,
            }
          }, DOC_TABLE_LINE),
        { timeout: 5000, message: 'waiting for doc.table marker to be published' }
      )
      .not.toBeNull()
    void diagnostic // expect.poll returns undefined; re-read the value to use it.

    const lspDiagnostic = (await page.evaluate(
      ({ line, monacoToLspSeverity }) => {
        const markers = window.__e2e.bridge?.getMarkers?.() ?? []
        const marker = markers.find(
          (m: { startLineNumber: number; message: string; source: string }) =>
            m.startLineNumber === line && m.message.includes('doc.table') && m.source === 'lex'
        ) as
          | {
              startLineNumber: number
              startColumn: number
              endLineNumber: number
              endColumn: number
              severity: number
              code?: string | number
              source: string
              message: string
            }
          | undefined
        if (!marker) return null
        return {
          range: {
            start: { line: marker.startLineNumber - 1, character: marker.startColumn - 1 },
            end: { line: marker.endLineNumber - 1, character: marker.endColumn - 1 },
          },
          severity: monacoToLspSeverity[marker.severity] ?? 1,
          code: marker.code,
          source: marker.source,
          message: marker.message,
        }
      },
      { line: DOC_TABLE_LINE, monacoToLspSeverity: MONACO_TO_LSP_SEVERITY }
    )) as LspDiagnostic | null
    expect(lspDiagnostic, 'doc.table marker should still be present after poll').not.toBeNull()

    const actions = await page.evaluate(
      async ({ line, diag }) => {
        return (await window.__e2e.bridge.requestCodeActions?.(line, 1, diag as LspDiagnostic)) as
          | LspCodeAction[]
          | null
      },
      { line: DOC_TABLE_LINE, diag: lspDiagnostic as LspDiagnostic }
    )

    expect(actions, 'code-action request should return a result').not.toBeNull()
    const rewrite = (actions ?? []).find(
      (a) => a.title.toLowerCase().includes('rewrite') && a.title.includes('table')
    )
    expect(
      rewrite,
      `expected "Rewrite doc.table to table" action; got: ${(actions ?? []).map((a) => a.title).join(', ')}`
    ).toBeTruthy()

    // Apply the workspace edit and confirm the line flipped.
    if (rewrite?.edit) {
      const applied = await page.evaluate(
        (edit) => window.__e2e.bridge.applyWorkspaceEdit?.(edit) ?? false,
        rewrite.edit
      )
      expect(applied, 'applyWorkspaceEdit should succeed').toBe(true)
    } else {
      throw new Error('label-policy quickfix had no inline edit')
    }

    const newLine = await page.evaluate(
      (line) => window.__e2e.bridge.getLineContent?.(line),
      DOC_TABLE_LINE
    )
    expect(newLine, `line should flip to ":: table ::"; got ${newLine}`).toMatch(/:: table ::/)
    expect(newLine, 'line should no longer carry doc.table').not.toMatch(/doc\.table/)
  })

  test('hover annotates shortcut / stripped / community label forms', async ({ page }) => {
    await openFixture(page, 'label-policy.lex')
    await waitForLsp(page)

    const cases: Array<{ line: number; column: number; expect: string }> = [
      // Position just inside the label token (after `:: `, which is 3 chars).
      { line: 15, column: 4, expect: 'Shortcut for' }, // :: title ::
      { line: 17, column: 4, expect: 'Prefix-stripped form' }, // :: metadata.author ::
      { line: 19, column: 4, expect: 'Community label' }, // :: acme.task ::
    ]

    for (const c of cases) {
      const hover = await page.evaluate(
        async ({ line, column }) => {
          return (await window.__e2e.bridge.requestHover?.(line, column)) as LspHover | null
        },
        { line: c.line, column: c.column }
      )
      const text = unwrapHoverText(hover)
      expect(text, `hover on line ${c.line} should include "${c.expect}"; got: ${text}`).toContain(
        c.expect
      )
    }
  })

  test('completion offers blessed shortcuts after "::"', async ({ page }) => {
    await openFixture(page, 'label-policy.lex')
    await waitForLsp(page)

    // Append a fresh `:: ` line via Monaco's `executeEdits`. This goes
    // through the normal change pipeline (LSP picks up `didChange` via
    // its existing listener), unlike `setValue` which replaces the
    // whole buffer in a single delta and races against the LSP's view.
    // Keyboard typing was also tried but races against Monaco's
    // auto-suggest on the `:` trigger character.
    const triggerLine = (await page.evaluate(() => {
      return window.__e2e.bridge.appendToEditor?.('\n\n:: ') as number | null
    })) as number | null
    expect(triggerLine, 'appendToEditor should return the trigger line').not.toBeNull()

    // `appendToEditor` returns the post-insertion last-line number,
    // which is exactly the line containing the trailing `:: `.
    await page.evaluate(
      ({ line }) => {
        // Cursor at column 4 = just past the trailing space after `:: `.
        window.__e2e.bridge.setCursor?.(line, 4)
        window.__e2e.bridge.focusEditor?.()
      },
      { line: triggerLine as number }
    )

    // Wait for the editor side to show the appended line first.
    await expect
      .poll(
        () =>
          page.evaluate(({ line }) => window.__e2e.bridge.getLineContent?.(line), {
            line: triggerLine as number,
          }),
        { timeout: 5000, message: 'waiting for editor to show appended `:: ` line' }
      )
      .toMatch(/^::\s/)

    // The lex-buffer completion provider debounces `textDocument/didChange`
    // before sending it to the LSP (~250ms by default). Without a settle
    // window here, `triggerSuggest()` fires a completion request before
    // the new `:: ` line reaches the server, which then returns the
    // reference-completions list (annotations from elsewhere in the doc)
    // rather than the verbatim-opener list. The 600ms wait covers the
    // debounce plus a round-trip to the server. We deliberately do NOT
    // re-trigger inside the poll below — Monaco's suggest controller
    // cancels overlapping requests, so a retrigger would race against
    // the first response landing in `__lexCompletionSample`.
    await page.waitForTimeout(600)

    await page.evaluate(() => window.__e2e.bridge.triggerSuggest?.())

    await expect
      .poll(
        async () => {
          const sample = await page.evaluate(() => {
            const win = window as unknown as { __lexCompletionSample?: Array<{ label?: string }> }
            return win.__lexCompletionSample ?? []
          })
          return sample.map((s) => s.label ?? '')
        },
        { timeout: 10000, message: 'waiting for completion sample with blessed shortcuts' }
      )
      .toContain('table')

    const items = await page.evaluate(() => {
      const win = window as unknown as { __lexCompletionSample?: Array<{ label?: string }> }
      return (win.__lexCompletionSample ?? []).map((s) => s.label ?? '')
    })

    for (const expected of ['table', 'image', 'video', 'audio']) {
      expect(items, `expected blessed shortcut "${expected}" in completions`).toContain(expected)
    }
    for (const item of items) {
      expect(item, `reserved doc.* label should not be offered (got "${item}")`).not.toMatch(
        /^doc\./
      )
    }
  })
})
