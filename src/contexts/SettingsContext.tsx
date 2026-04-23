/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import {
  AppSettings,
  EditorSettings,
  FormatterSettings,
  defaultAppSettings,
  defaultFileTreeSettings,
} from '@/settings/types'
import { setSettingsSnapshot } from '@/settings/snapshot'

import { lspClient } from '@/lsp/client'
import { SpellcheckSettings, FileTreeSettings } from '@/settings/types'
import { spellcheckService } from '@/spellcheck/service'

interface SettingsContextType {
  settings: AppSettings
  updateEditorSettings: (settings: EditorSettings) => Promise<void>
  updateFormatterSettings: (settings: FormatterSettings) => Promise<void>
  updateSpellcheckSettings: (settings: SpellcheckSettings) => Promise<void>
  updateFileTreeSettings: (settings: FileTreeSettings) => Promise<void>
}

const defaultSettings: AppSettings = defaultAppSettings

const SettingsContext = createContext<SettingsContextType | null>(null)

let spellcheckInitialized = false

const LSP_READY_FALLBACK_MS = 10_000

/**
 * Run `fn` after the LSP has finished its initialize handshake (i.e.
 * `window.__lexLspReady` is true), or immediately if it already is.
 * Spellcheck is deferred through this so that nspell's synchronous
 * dictionary parse — several seconds for large locales — doesn't
 * starve the LSP response handler that flips the flag. A fallback
 * timer ensures spellcheck still initializes if the LSP never comes
 * up (so the feature isn't silently disabled when the binary is
 * missing or crashing).
 */
function deferUntilLspReady(fn: () => void): void {
  if ((window as { __lexLspReady?: boolean }).__lexLspReady) {
    fn()
    return
  }
  let fired = false
  const handler = () => {
    if (fired) return
    fired = true
    window.removeEventListener('lexed:lsp-ready', handler)
    fn()
  }
  window.addEventListener('lexed:lsp-ready', handler)
  setTimeout(handler, LSP_READY_FALLBACK_MS)
}

async function applySpellcheckSettings(settings: SpellcheckSettings) {
  spellcheckService.setEnabled(settings.enabled)
  if (settings.enabled) {
    await spellcheckService.setLanguage(settings.language)
    if (!spellcheckInitialized) {
      spellcheckService.registerCodeActions()
      spellcheckInitialized = true
    }
    // Re-check all open models
    for (const model of (await import('monaco-editor')).editor.getModels()) {
      spellcheckService.scheduleCheck(model)
    }
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)

  useEffect(() => {
    // Initial load
    window.ipcRenderer.getAppSettings().then((loadedSettings: any) => {
      setSettings((prev) => {
        const next = {
          editor: { ...prev.editor, ...(loadedSettings?.editor ?? {}) },
          formatter: { ...prev.formatter, ...(loadedSettings?.formatter ?? {}) },
          spellcheck: { ...prev.spellcheck, ...(loadedSettings?.spellcheck ?? {}) },
          fileTree: {
            ...defaultFileTreeSettings,
            ...prev.fileTree,
            ...(loadedSettings?.fileTree ?? {}),
          },
          keybindings: {
            overrides: {
              ...prev.keybindings.overrides,
              ...(loadedSettings?.keybindings?.overrides ?? {}),
            },
          },
          lastFolder: loadedSettings?.lastFolder,
        } satisfies AppSettings
        setSettingsSnapshot(next)

        // Disable LSP-side spellcheck (now handled client-side)
        lspClient.sendNotification('workspace/didChangeConfiguration', {
          settings: { spellcheck: { enabled: false } },
        })

        // Initialize client-side spellcheck AFTER the LSP has completed
        // its initialize handshake. nspell() parses the whole .dic
        // synchronously on construction; large locales (pt_BR is 4+ MB,
        // ru_RU is similar) block the renderer long enough to starve
        // the LSP InitializeResponse handler, so the `__lexLspReady`
        // flag never gets set. Waiting lets the handshake finish first.
        deferUntilLspReady(() => applySpellcheckSettings(next.spellcheck))

        return next
      })
    })

    // Listen for changes
    const unsubscribe = window.ipcRenderer.onSettingsChanged((newSettings: any) => {
      setSettings((prev) => {
        const next = {
          editor: { ...prev.editor, ...(newSettings?.editor ?? {}) },
          formatter: { ...prev.formatter, ...(newSettings?.formatter ?? {}) },
          spellcheck: { ...prev.spellcheck, ...(newSettings?.spellcheck ?? {}) },
          fileTree: {
            ...defaultFileTreeSettings,
            ...prev.fileTree,
            ...(newSettings?.fileTree ?? {}),
          },
          keybindings: {
            overrides: {
              ...prev.keybindings.overrides,
              ...(newSettings?.keybindings?.overrides ?? {}),
            },
          },
          lastFolder: newSettings?.lastFolder,
        } satisfies AppSettings
        setSettingsSnapshot(next)

        // Apply client-side spellcheck settings
        applySpellcheckSettings(next.spellcheck)

        return next
      })
    })

    return unsubscribe
  }, [])

  const updateEditorSettings = async (editorSettings: EditorSettings) => {
    await window.ipcRenderer.setEditorSettings(editorSettings)
    // Optimistic update
    setSettings((prev) => {
      const next = { ...prev, editor: editorSettings } satisfies AppSettings
      setSettingsSnapshot(next)
      return next
    })
  }

  const updateFormatterSettings = async (formatterSettings: FormatterSettings) => {
    await window.ipcRenderer.setFormatterSettings(formatterSettings)
    setSettings((prev) => {
      const next = { ...prev, formatter: formatterSettings } satisfies AppSettings
      setSettingsSnapshot(next)
      return next
    })
  }

  const updateSpellcheckSettings = async (spellcheckSettings: SpellcheckSettings) => {
    console.log('[SettingsContext] Updating spellcheck settings:', spellcheckSettings)
    await window.ipcRenderer.setSpellcheckSettings(spellcheckSettings)
    setSettings((prev) => {
      const next = { ...prev, spellcheck: spellcheckSettings } satisfies AppSettings
      setSettingsSnapshot(next)
      applySpellcheckSettings(next.spellcheck)
      return next
    })
  }

  const updateFileTreeSettings = async (fileTreeSettings: FileTreeSettings) => {
    await window.ipcRenderer.setFileTreeSettings(fileTreeSettings)
    setSettings((prev) => {
      const next = { ...prev, fileTree: fileTreeSettings } satisfies AppSettings
      setSettingsSnapshot(next)
      return next
    })
  }

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateEditorSettings,
        updateFormatterSettings,
        updateSpellcheckSettings,
        updateFileTreeSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}
