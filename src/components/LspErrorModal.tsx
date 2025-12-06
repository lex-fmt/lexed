interface LspErrorModalProps {
  isOpen: boolean
  title: string
  message: string
  suggestion?: string
  onClose: () => void
}

export function LspErrorModal({ isOpen, title, message, suggestion, onClose }: LspErrorModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center py-24"
      style={{ backgroundColor: 'var(--locked-content-overlay)' }}
      onClick={onClose}
    >
      <div
        className="w-[500px] rounded-lg border border-border bg-panel shadow-xl text-foreground"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          {title}
        </div>
        <div className="space-y-4 px-4 py-4 text-sm">
          <p>{message}</p>
          {suggestion && (
            <p className="text-muted-foreground text-xs leading-relaxed">
              {suggestion}
            </p>
          )}
          <div className="flex justify-end">
            <button
              className="px-3 py-1.5 rounded border border-border bg-panel-hover text-sm"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
