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

    // Pick the forbidden-label-prefix marker on the doc.table line so the
    // code-action request carries the same diagnostic the LSP attached to.
    const diagnostic = await page.evaluate((line) => {
      const markers = window.__e2e.bridge?.getMarkers?.() ?? []
      // Monaco markers are 1-indexed; LSP positions are 0-indexed. We send
      // the marker back as an LSP-shaped diagnostic for the code-action
      // context, so the request looks indistinguishable from the one the
      // editor would send when the user opens the lightbulb menu.
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
        severity: marker.severity,
        code: marker.code,
        source: marker.source,
        message: marker.message,
      }
    }, DOC_TABLE_LINE)

    expect(diagnostic, 'doc.table forbidden-label-prefix marker should be present').not.toBeNull()

    const actions = await page.evaluate(
      async ({ line, diag }) => {
        return (await window.__e2e.bridge.requestCodeActions?.(line, 1, diag as LspDiagnostic)) as
          | LspCodeAction[]
          | null
      },
      { line: DOC_TABLE_LINE, diag: diagnostic as LspDiagnostic }
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

    await page.evaluate(
      ({ line }) => {
        // Cursor at column 4 = just past the trailing space after `:: `.
        window.__e2e.bridge.setCursor?.(line + 2, 4)
        window.__e2e.bridge.focusEditor?.()
      },
      { line: triggerLine as number }
    )

    // Let the LSP ingest the didChange before requesting completion.
    await page.waitForTimeout(500)
    await page.evaluate(() => window.__e2e.bridge.triggerSuggest?.())

    // Poll the completion sample (populated by the buffer's completion
    // provider; see packages/lex-buffer/src/lsp/providers/completion.ts).
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
