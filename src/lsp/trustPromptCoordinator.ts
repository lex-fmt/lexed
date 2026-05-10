import type { TrustRequestParams, TrustResponse } from '@lex-fmt/lex-buffer'

/**
 * Bridge between the LSP request handler (which runs outside React)
 * and the modal component (which is rendered by React). The handler
 * calls `request(params)` and gets a Promise that resolves when the
 * user clicks Trust / Deny / dismisses the modal. The modal subscribes
 * to `subscribe()` to know when a prompt is open and to display it.
 *
 * Single-prompt design: only one trust prompt can be open at a time.
 * If a second `request` arrives while the first is unresolved, it is
 * queued — `lex-fmt/lex#549`'s server-side boot is single-threaded
 * via the `extension_init` mutex, so this should rarely happen, but
 * queuing keeps the renderer correct if it does.
 */

interface PendingPrompt {
  params: TrustRequestParams
  resolve: (response: TrustResponse) => void
}

type Subscriber = (prompt: PendingPrompt | null) => void

class TrustPromptCoordinator {
  private current: PendingPrompt | null = null
  private queue: PendingPrompt[] = []
  private subscribers: Subscriber[] = []

  /**
   * Called by the LSP request handler. Returns a Promise that resolves
   * with the user's TrustResponse when the modal is closed.
   */
  request(params: TrustRequestParams): Promise<TrustResponse> {
    return new Promise((resolve) => {
      const pending: PendingPrompt = { params, resolve }
      if (this.current) {
        // A prompt is already open; queue this one. The current
        // prompt's resolve will dequeue when it finishes.
        this.queue.push(pending)
      } else {
        this.current = pending
        this.notify()
      }
    })
  }

  /**
   * Called by the modal when the user makes a decision (or dismisses).
   * Resolves the current Promise and advances to the next queued
   * prompt if any.
   */
  resolveCurrent(response: TrustResponse): void {
    const cur = this.current
    if (!cur) return
    cur.resolve(response)
    const next = this.queue.shift() ?? null
    this.current = next
    this.notify()
  }

  /**
   * Subscribe to current-prompt changes. The callback fires once
   * immediately with the current state, then on every subsequent
   * change. Returns an unsubscribe fn.
   */
  subscribe(cb: Subscriber): () => void {
    this.subscribers.push(cb)
    cb(this.current)
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb)
    }
  }

  /** For tests. */
  _peekCurrent(): PendingPrompt | null {
    return this.current
  }

  /** For tests. */
  _queueLength(): number {
    return this.queue.length
  }

  private notify() {
    for (const cb of this.subscribers) {
      cb(this.current)
    }
  }
}

export const trustPromptCoordinator = new TrustPromptCoordinator()
export type { PendingPrompt }
