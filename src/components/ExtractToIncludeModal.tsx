import { useEffect, useRef, useState } from 'react'

interface ExtractToIncludeModalProps {
  isOpen: boolean
  onSubmit: (src: string) => void
  onCancel: () => void
}

/**
 * Modal prompting the user for the include path that `lex.extractToInclude`
 * will write the current selection to. The submitted value is passed to the
 * LSP command unchanged — server-side validation
 * (`lex_lsp::features::extract::validate_include_path`) handles path-shape
 * errors and surfaces them through the standard error toast.
 *
 * Mirrors `LspErrorModal.tsx` and `TrustPromptModal.tsx` for visual
 * consistency.
 */
export function ExtractToIncludeModal({ isOpen, onSubmit, onCancel }: ExtractToIncludeModalProps) {
  const [src, setSrc] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset and focus on open. The trust-prompt modal does the same;
  // keeps the input box from carrying stale values between invocations.
  useEffect(() => {
    if (!isOpen) return
    setSrc('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [isOpen])

  // Esc cancels, matching the trust-prompt + LSP-error modals.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const submit = () => {
    const trimmed = src.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center py-24"
      style={{ backgroundColor: 'var(--locked-content-overlay)' }}
      onClick={onCancel}
    >
      <div
        className="w-[500px] rounded-lg border border-border bg-panel shadow-xl text-foreground"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          Extract selection to include
        </div>
        <div className="space-y-4 px-4 py-4 text-sm">
          <p className="text-muted-foreground text-xs leading-relaxed">
            Path for the new include file, relative to the includes root.
          </p>
          <input
            ref={inputRef}
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="e.g. chapters/intro.lex"
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <button
              className="px-3 py-1.5 rounded border border-border bg-panel-hover text-sm"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1.5 rounded border border-border bg-panel-hover text-sm disabled:opacity-50"
              onClick={submit}
              disabled={!src.trim()}
            >
              Extract
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
