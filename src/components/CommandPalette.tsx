import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeybindingDescriptor } from '@/keybindings/types'
import { KeybindingLabel } from './KeybindingLabel'
import { cn } from '@/lib/utils'

interface CommandPaletteProps {
  isOpen: boolean
  commands: KeybindingDescriptor[]
  onClose: () => void
  onSelect: (id: string) => void
}

const normalize = (value: string) => value.trim().toLowerCase()

export function CommandPalette({ isOpen, commands, onClose, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredCommands = useMemo(() => {
    const normalized = normalize(query)
    if (!normalized) {
      return commands
    }
    return commands.filter((command) => {
      const haystack = `${command.title} ${command.description ?? ''}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [commands, query])

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setActiveIndex(0)
    const timeout = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [isOpen])

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

  const activeCommand = filteredCommands[Math.min(activeIndex, filteredCommands.length - 1)]

  const handleSelect = (commandId: string) => {
    onSelect(commandId)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center py-20"
      style={{ backgroundColor: 'var(--locked-content-overlay)' }}
      onClick={onClose}
    >
      <div
        className="w-[600px] rounded-lg border border-border bg-panel shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((prev) => Math.min(prev + 1, Math.max(filteredCommands.length - 1, 0)))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((prev) => Math.max(prev - 1, 0))
            } else if (event.key === 'Enter') {
              if (activeCommand) {
                event.preventDefault()
                onClose()
                handleSelect(activeCommand.id)
              }
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          }}
          placeholder="Type a command"
          className="w-full border-b border-border bg-panel px-4 py-3 text-sm text-foreground focus:outline-none"
        />
        <div className="max-h-80 overflow-y-auto">
          {filteredCommands.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted">No commands found</div>
          )}
          {filteredCommands.map((command, index) => (
            <button
              key={command.id}
              className={cn(
                'flex w-full items-center justify-between px-4 py-3 text-left text-sm',
                index === activeIndex
                  ? 'bg-panel-hover text-foreground'
                  : 'text-muted hover:text-foreground'
              )}
              onClick={() => {
                onClose()
                handleSelect(command.id)
              }}
            >
              <div>
                <div className="font-medium">{command.title}</div>
                {command.description && (
                  <div className="text-xs text-muted">{command.description}</div>
                )}
              </div>
              {command.shortcuts[0] && <KeybindingLabel shortcut={command.shortcuts[0]} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
