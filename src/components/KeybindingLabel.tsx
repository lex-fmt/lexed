import type { ParsedShortcut } from '@/keybindings/types'
import { cn } from '@/lib/utils'

interface KeybindingLabelProps {
  shortcut: ParsedShortcut
  className?: string
}

function splitChordDisplay(display: string): string[][] {
  return display.split(' ').map((chord) => chord.split('+'))
}

export function KeybindingLabel({ shortcut, className }: KeybindingLabelProps) {
  const chordParts = splitChordDisplay(shortcut.display)
  return (
    <span className={cn('monaco-keybinding text-xs text-foreground/80', className)}>
      {chordParts.map((parts, chordIndex) => (
        <span key={`${shortcut.display}-${chordIndex}`} className="inline-flex items-center">
          {parts.map((part, index) => (
            <span key={`${part}-${index}`} className="inline-flex items-center">
              <span className="monaco-keybinding-key">{part}</span>
              {index < parts.length - 1 && (
                <span className="monaco-keybinding-key-separator" aria-hidden="true">
                  +
                </span>
              )}
            </span>
          ))}
          {chordIndex < chordParts.length - 1 && (
            <span className="monaco-keybinding-key-chord-separator" aria-hidden="true">
              {' '}
            </span>
          )}
        </span>
      ))}
    </span>
  )
}
