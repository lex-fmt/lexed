import { describe, expect, it } from 'vitest'
import type { TrustRequestParams, TrustResponse } from '@lex-fmt/lex-buffer'

// Pull the class out of the module via a re-export hack — the file
// only exports the singleton, so we import it and use it directly.
// Tests reset state between cases by resolving any pending prompt at
// the start.
import { trustPromptCoordinator } from './trustPromptCoordinator'

function fakeParams(namespace = 'acme'): TrustRequestParams {
  return {
    namespace,
    command_string: '/bin/handler',
    source: { kind: 'lex_toml', name: namespace },
    capability: 'full',
    transport: 'subprocess',
  }
}

function drain() {
  // Keep resolving until the queue is empty — used between tests so
  // the singleton's internal state doesn't leak across cases.
  while (trustPromptCoordinator._peekCurrent()) {
    trustPromptCoordinator.resolveCurrent({ decision: 'denied' })
  }
}

describe('trustPromptCoordinator', () => {
  it('exposes the pending prompt to subscribers', () => {
    drain()
    let observed: TrustRequestParams | null = null
    const unsub = trustPromptCoordinator.subscribe((p) => {
      observed = p ? p.params : null
    })
    expect(observed).toBeNull()

    void trustPromptCoordinator.request(fakeParams())
    expect(observed).not.toBeNull()
    expect((observed as unknown as TrustRequestParams).namespace).toBe('acme')

    unsub()
    drain()
  })

  it('resolves the request promise with the user decision', async () => {
    drain()
    const promise = trustPromptCoordinator.request(fakeParams())
    trustPromptCoordinator.resolveCurrent({ decision: 'trusted' })
    const resp: TrustResponse = await promise
    expect(resp.decision).toBe('trusted')
  })

  it('queues a second request and serves it after the first resolves', async () => {
    drain()
    const first = trustPromptCoordinator.request(fakeParams('acme'))
    const second = trustPromptCoordinator.request(fakeParams('beta'))

    expect(trustPromptCoordinator._peekCurrent()?.params.namespace).toBe('acme')
    expect(trustPromptCoordinator._queueLength()).toBe(1)

    trustPromptCoordinator.resolveCurrent({ decision: 'trusted' })
    const r1 = await first
    expect(r1.decision).toBe('trusted')

    expect(trustPromptCoordinator._peekCurrent()?.params.namespace).toBe('beta')

    trustPromptCoordinator.resolveCurrent({ decision: 'denied', reason: 'no thanks' })
    const r2 = await second
    expect(r2.decision).toBe('denied')
    expect(r2.reason).toBe('no thanks')
  })

  it('subscribers see the queue advance to the next prompt', () => {
    drain()
    const seen: Array<string | null> = []
    const unsub = trustPromptCoordinator.subscribe((p) => {
      seen.push(p ? p.params.namespace : null)
    })

    void trustPromptCoordinator.request(fakeParams('acme'))
    void trustPromptCoordinator.request(fakeParams('beta'))
    trustPromptCoordinator.resolveCurrent({ decision: 'trusted' })
    trustPromptCoordinator.resolveCurrent({ decision: 'denied' })

    // null at subscribe-time, "acme" when first arrives, then
    // "beta" when first resolves and queue advances, then null
    // when the queue empties.
    expect(seen).toEqual([null, 'acme', 'beta', null])
    unsub()
  })

  it('resolveCurrent is a no-op when no prompt is pending', () => {
    drain()
    // Should not throw.
    trustPromptCoordinator.resolveCurrent({ decision: 'trusted' })
    expect(trustPromptCoordinator._peekCurrent()).toBeNull()
  })
})
