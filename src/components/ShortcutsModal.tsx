import { useEffect, useMemo } from 'react'
import type { KeybindingDescriptor } from '@/keybindings/types'
import { KeybindingLabel } from './KeybindingLabel'

interface ShortcutsModalProps {
  isOpen: boolean
  shortcuts: KeybindingDescriptor[]
  onClose: () => void
}

export function ShortcutsModal({ isOpen, shortcuts, onClose }: ShortcutsModalProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, KeybindingDescriptor[]>()
    shortcuts.forEach((descriptor) => {
      if (!descriptor.shortcuts.length) return
      const group = map.get(descriptor.category) ?? []
      group.push(descriptor)
      map.set(descriptor.category, group)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [shortcuts])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center py-24"
      style={{ backgroundColor: 'var(--locked-content-overlay)' }}
      onClick={onClose}
    >
      <div
        className="w-[720px] rounded-lg border border-border bg-panel shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          Keyboard Shortcuts
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-4 py-4 space-y-6">
          {grouped.map(([category, entries]) => (
            <div key={category}>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {category}
              </div>
              <div className="divide-y divide-border rounded border border-border">
                {entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">{entry.title}</div>
                      {entry.description && (
                        <div className="text-xs text-muted-foreground">{entry.description}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {entry.shortcuts.map((shortcut) => (
                        <KeybindingLabel key={shortcut.display} shortcut={shortcut} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
