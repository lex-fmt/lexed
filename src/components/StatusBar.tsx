import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type * as Monaco from 'monaco-editor'
import { useSettings } from '@/contexts/SettingsContext'
import { SPELLCHECK_LANGUAGES } from '@/settings/spellcheckLanguages'

export interface ExportStatus {
  isExporting: boolean
  format: string | null
}

interface StatusBarProps {
  editor: Monaco.editor.IStandaloneCodeEditor | null
  exportStatus?: ExportStatus
  onVimStatusNodeChange?: (node: HTMLDivElement | null) => void
}

interface CursorInfo {
  line: number
  column: number
  selected: number
  selectedLines: number
}

export function StatusBar({ editor, exportStatus, onVimStatusNodeChange }: StatusBarProps) {
  const [cursor, setCursor] = useState<CursorInfo>({
    line: 1,
    column: 1,
    selected: 0,
    selectedLines: 0,
  })
  const { settings, updateSpellcheckSettings } = useSettings()
  const [isSpellMenuOpen, setIsSpellMenuOpen] = useState(false)
  const spellButtonRef = useRef<HTMLButtonElement | null>(null)
  const spellMenuRef = useRef<HTMLDivElement | null>(null)

  const handleVimStatusRef = useCallback(
    (node: HTMLDivElement | null) => {
      onVimStatusNodeChange?.(node)
      if (!node) return
      node.textContent = ''
    },
    [onVimStatusNodeChange]
  )

  useEffect(() => {
    if (!editor) return

    const updateCursor = () => {
      const position = editor.getPosition()
      const selection = editor.getSelection()
      const model = editor.getModel()

      if (position) {
        let selected = 0
        let selectedLines = 0

        if (selection && !selection.isEmpty() && model) {
          selected = model.getValueInRange(selection).length
          selectedLines = selection.endLineNumber - selection.startLineNumber + 1
        }

        setCursor({
          line: position.lineNumber,
          column: position.column,
          selected,
          selectedLines,
        })
      }
    }

    const disposables = [
      editor.onDidChangeCursorPosition(updateCursor),
      editor.onDidChangeCursorSelection(updateCursor),
    ]

    updateCursor()

    return () => {
      disposables.forEach((d) => d.dispose())
    }
  }, [editor])

  useEffect(() => {
    if (!isSpellMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (spellButtonRef.current?.contains(target) || spellMenuRef.current?.contains(target)) {
        return
      }
      setIsSpellMenuOpen(false)
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSpellMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isSpellMenuOpen])

  const handleSpellSelect = useCallback(
    async (value: string | 'off') => {
      if (value === 'off') {
        await updateSpellcheckSettings({ ...settings.spellcheck, enabled: false })
      } else {
        await updateSpellcheckSettings({ enabled: true, language: value })
      }
      setIsSpellMenuOpen(false)
    },
    [settings.spellcheck, updateSpellcheckSettings]
  )

  const activeSpellLanguage = SPELLCHECK_LANGUAGES.find(
    (lang) => lang.value === settings.spellcheck.language
  )
  const spellLabel = settings.spellcheck.enabled
    ? (activeSpellLanguage?.label ?? settings.spellcheck.language)
    : 'off'

  return (
    <div className="h-6 flex items-center px-3 bg-panel border-t border-border text-xs text-muted-foreground shrink-0 gap-4">
      <div
        ref={handleVimStatusRef}
        data-testid="vim-status"
        className="font-mono opacity-80 text-muted-foreground min-w-[96px]"
      />
      <span>
        Ln {cursor.line}, Col {cursor.column}
      </span>
      {cursor.selected > 0 && (
        <span>
          ({cursor.selected} selected
          {cursor.selectedLines > 1 ? `, ${cursor.selectedLines} lines` : ''})
        </span>
      )}
      {exportStatus?.isExporting && (
        <span className="flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" />
          Exporting to {exportStatus.format}
        </span>
      )}
      <div className="flex items-center gap-2 ml-auto">
        <div className="relative">
          <button
            type="button"
            ref={spellButtonRef}
            data-testid="status-spell-button"
            aria-haspopup="menu"
            aria-expanded={isSpellMenuOpen}
            onClick={() => setIsSpellMenuOpen((prev) => !prev)}
            className="flex items-center gap-1 px-2 py-0.5 rounded border border-transparent hover:border-border/70 hover:bg-panel-hover transition-colors text-muted-foreground hover:text-foreground"
          >
            Spell: {spellLabel}
          </button>
          {isSpellMenuOpen && (
            <div
              ref={spellMenuRef}
              data-testid="status-spell-menu"
              className="absolute bottom-7 right-0 w-44 bg-panel border border-border rounded shadow-lg py-1 z-50"
            >
              <button
                type="button"
                data-testid="status-spell-option-off"
                className="w-full text-left px-3 py-1 hover:bg-panel-hover text-foreground text-xs"
                onClick={() => {
                  void handleSpellSelect('off')
                }}
              >
                Spell: off
              </button>
              <div className="border-t border-border/60 my-1" />
              {SPELLCHECK_LANGUAGES.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  data-testid={`status-spell-option-${option.value}`}
                  className="w-full text-left px-3 py-1 hover:bg-panel-hover text-foreground text-xs"
                  onClick={() => {
                    void handleSpellSelect(option.value)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <span>Lex</span>
      </div>
    </div>
  )
}
