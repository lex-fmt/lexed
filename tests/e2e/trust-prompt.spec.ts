import { test, expect } from './lib'
import { openFixture } from './helpers'

interface TrustRequestParams {
  namespace: string
  command_string: string
  source: { kind: string; name?: string; path?: string; uri?: string }
  capability: string
  transport: string
}

interface TrustResponse {
  decision: string
  reason?: string
}

declare global {
  interface Window {
    __e2e: {
      bridge: {
        injectTrustRequest?: (params: TrustRequestParams) => Promise<TrustResponse>
      } & Record<string, unknown>
    } & Record<string, unknown>
  }
}

const sampleParams: TrustRequestParams = {
  namespace: 'acme',
  command_string: '/usr/local/bin/acme-handler --serve',
  source: { kind: 'lex_toml', name: 'acme' },
  capability: 'full',
  transport: 'subprocess'
}

test.describe('lex/trustRequest modal', () => {
  test('renders the prompt with namespace + command + capability', async ({ page }) => {
    // Open any fixture so the app is past initial load. The trust
    // prompt itself is decoupled from any open file — it fires when
    // the LSP sees a [labels] block during boot. We're injecting
    // directly via the e2e bridge to avoid the workspace setup
    // overhead; the wire-shape correctness is what matters here.
    await openFixture(page, 'empty.lex')

    // Inject a trust request and wait for the modal to render. Don't
    // await the resolved Promise here — that resolves only after
    // the user clicks. We just wait for the modal to appear.
    await page.evaluate(async (params) => {
      // Fire and forget — the Promise will resolve when the modal
      // is closed, which we'll do via the click handler in the
      // next part of the test.
      void window.__e2e.bridge.injectTrustRequest!(params)
    }, sampleParams)

    // Modal title comes from <TrustPromptModal />.
    await expect(page.getByText('Lex extension trust required')).toBeVisible({ timeout: 5000 })
    // Headline names the namespace + transport.
    await expect(page.getByText(/"acme".*subprocess handler/)).toBeVisible()
    // Detail rows: source label includes lex.toml + the namespace name.
    await expect(page.getByText('lex.toml [labels] entry "acme"')).toBeVisible()
    // Command string in the dl.
    await expect(page.getByText('/usr/local/bin/acme-handler --serve')).toBeVisible()
    // Capability label for "full".
    await expect(page.getByText(/fs and\/or net access/)).toBeVisible()
    // Action buttons.
    await expect(page.getByRole('button', { name: 'Trust' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Deny' })).toBeVisible()
  })

  test('clicking Trust resolves the request with decision: trusted', async ({ page }) => {
    await openFixture(page, 'empty.lex')
    // Race-free pattern: kick off the injection in the renderer and
    // capture the resolved response on a global so we can read it
    // back via page.evaluate after clicking.
    await page.evaluate((params) => {
      const w = window as unknown as Window & { __trustResp?: TrustResponse }
      w.__trustResp = undefined
      void window.__e2e.bridge.injectTrustRequest!(params).then((resp) => {
        w.__trustResp = resp
      })
    }, sampleParams)

    await expect(page.getByText('Lex extension trust required')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Trust' }).click()

    // Modal closes after the click resolves the Promise.
    await expect(page.getByText('Lex extension trust required')).not.toBeVisible({
      timeout: 5000
    })
    // Poll for the .then() callback to have populated __trustResp.
    // The microtask scheduling of Promise resolution doesn't
    // guarantee __trustResp is set the instant the modal disappears,
    // so we wait for the global to populate before asserting.
    await page.waitForFunction(
      () =>
        (window as unknown as Window & { __trustResp?: TrustResponse }).__trustResp !== undefined,
      null,
      { timeout: 5000 }
    )
    const response = await page.evaluate(() => {
      const w = window as unknown as Window & { __trustResp?: TrustResponse }
      return w.__trustResp
    })
    expect(response?.decision).toBe('trusted')
    expect(response?.reason).toBeUndefined()
  })

  test('clicking Deny resolves with decision: denied + named reason', async ({ page }) => {
    await openFixture(page, 'empty.lex')
    await page.evaluate((params) => {
      const w = window as unknown as Window & { __trustResp?: TrustResponse }
      w.__trustResp = undefined
      void window.__e2e.bridge.injectTrustRequest!(params).then((resp) => {
        w.__trustResp = resp
      })
    }, sampleParams)

    await expect(page.getByText('Lex extension trust required')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Deny' }).click()

    await expect(page.getByText('Lex extension trust required')).not.toBeVisible({
      timeout: 5000
    })
    await page.waitForFunction(
      () =>
        (window as unknown as Window & { __trustResp?: TrustResponse }).__trustResp !== undefined,
      null,
      { timeout: 5000 }
    )
    const response = await page.evaluate(() => {
      const w = window as unknown as Window & { __trustResp?: TrustResponse }
      return w.__trustResp
    })
    expect(response?.decision).toBe('denied')
    expect(response?.reason).toContain('acme')
    expect(response?.reason).toContain('denied trust')
  })

  test('Esc dismisses with denied + dismissed reason (fail-closed)', async ({ page }) => {
    // Esc handler is wired in TrustPromptModal — Copilot caught
    // this missing in PR #86's review. Verifying it actually works
    // end-to-end keeps the regression guard tight.
    await openFixture(page, 'empty.lex')
    await page.evaluate((params) => {
      const w = window as unknown as Window & { __trustResp?: TrustResponse }
      w.__trustResp = undefined
      void window.__e2e.bridge.injectTrustRequest!(params).then((resp) => {
        w.__trustResp = resp
      })
    }, sampleParams)

    await expect(page.getByText('Lex extension trust required')).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')

    await expect(page.getByText('Lex extension trust required')).not.toBeVisible({
      timeout: 5000
    })
    await page.waitForFunction(
      () =>
        (window as unknown as Window & { __trustResp?: TrustResponse }).__trustResp !== undefined,
      null,
      { timeout: 5000 }
    )
    const response = await page.evaluate(() => {
      const w = window as unknown as Window & { __trustResp?: TrustResponse }
      return w.__trustResp
    })
    expect(response?.decision).toBe('denied')
    expect(response?.reason).toContain('dismissed')
  })
})
