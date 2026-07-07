import { useEffect, useState } from 'react'
import { describeCapability, describeSource, formatPromptHeadline } from '@lex-fmt/lex-buffer'
import { trustPromptCoordinator, type PendingPrompt } from '../lsp/trustPromptCoordinator'

/**
 * Modal that renders a `lex/trustRequest` prompt. Subscribes to the
 * `trustPromptCoordinator` — the LSP request handler queues a prompt
 * via `coordinator.request()`, this component sees it through its
 * subscription, and the user's button click resolves the underlying
 * Promise via `coordinator.resolveCurrent()`.
 *
 * Visual + interaction style mirrors `LspErrorModal.tsx` (the existing
 * modal pattern in lexed): full-screen overlay, click-outside
 * dismisses (treated as denied — fail-closed), Esc handled by the
 * surrounding overlay. Two action buttons: Trust (primary) and Deny
 * (default / focused — accidental Enter doesn't grant trust).
 */
export function TrustPromptModal() {
  const [pending, setPending] = useState<PendingPrompt | null>(null)

  useEffect(() => {
    const unsubscribe = trustPromptCoordinator.subscribe(setPending)
    return unsubscribe
  }, [])

  // Esc dismisses the modal. The click-outside listener on the
  // overlay div handles that gesture; without this keyboard handler,
  // users couldn't dismiss with Esc as the prompt body promises.
  useEffect(() => {
    if (!pending) return
    const ns = pending.params.namespace
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        // Same fail-closed behaviour as click-outside.
        trustPromptCoordinator.resolveCurrent({
          decision: 'denied',
          reason: `Trust prompt for namespace \`${ns}\` was dismissed without a decision.`
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pending])

  if (!pending) return null

  const { params } = pending
  const handleTrust = () => {
    trustPromptCoordinator.resolveCurrent({ decision: 'trusted' })
  }
  const handleDeny = () => {
    trustPromptCoordinator.resolveCurrent({
      decision: 'denied',
      reason: `User denied trust for namespace \`${params.namespace}\` in this workspace.`
    })
  }
  const handleDismiss = () => {
    // Click-outside fail-closed: a dismissed prompt must not silently
    // grant trust. Keyboard Esc is handled by the keydown listener
    // above, which routes to the same outcome.
    trustPromptCoordinator.resolveCurrent({
      decision: 'denied',
      reason: `Trust prompt for namespace \`${params.namespace}\` was dismissed without a decision.`
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center py-24"
      style={{ backgroundColor: 'var(--locked-content-overlay)' }}
      onClick={handleDismiss}
    >
      <div
        className="w-[520px] rounded-lg border border-border bg-panel shadow-xl text-foreground"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          Lex extension trust required
        </div>
        <div className="space-y-3 px-4 py-4 text-sm">
          <p>{formatPromptHeadline(params)}</p>
          <dl className="space-y-1 text-xs text-muted-foreground">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-medium">Source</dt>
              <dd className="flex-1 break-words">{describeSource(params.source)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-medium">Command</dt>
              <dd className="flex-1 break-all font-mono">{params.command_string}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-medium">Capabilities</dt>
              <dd className="flex-1 break-words">{describeCapability(params.capability)}</dd>
            </div>
          </dl>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Trusting will allow this binary to run on this workspace&apos;s documents until you
            revoke it. Denying registers the namespace schema-only — pre-validation still runs but
            no handler is invoked.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              autoFocus
              className="px-3 py-1.5 rounded border border-border bg-panel-hover text-sm"
              onClick={handleDeny}
            >
              Deny
            </button>
            <button
              className="px-3 py-1.5 rounded border border-border bg-accent text-accent-foreground text-sm"
              onClick={handleTrust}
            >
              Trust
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
