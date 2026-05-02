import * as monaco from 'monaco-editor'

import { PALETTE, RULES } from './theme-data'

export type ThemeMode = 'dark' | 'light'

// Editor chrome (background + line highlight) is Monaco-specific and
// not part of the canonical lex-theme.json (which covers only token
// highlighting). Keep these hand-written.
const CHROME: Record<ThemeMode, { background: string; lineHighlight: string }> = {
  light: {
    background: '#ffffff',
    lineHighlight: '#f6f6f6',
  },
  dark: {
    background: '#0c0c0cec',
    lineHighlight: '#181818ff',
  },
}

const THEME_NAME = 'lex-monochrome'

function defineTheme(mode: ThemeMode) {
  const palette = PALETTE[mode]
  const chrome = CHROME[mode]
  const baseTheme = mode === 'dark' ? 'vs-dark' : 'vs'
  const themeName = `${THEME_NAME}-${mode}`

  monaco.editor.defineTheme(themeName, {
    base: baseTheme,
    inherit: true,
    rules: RULES[mode],
    colors: {
      'editor.foreground': palette.normal,
      'editor.background': chrome.background,
      'editor.lineHighlightBackground': chrome.lineHighlight,
      'editorLineNumber.foreground': palette.faint,
      'editorLineNumber.activeForeground': palette.normal,
    },
  })

  return themeName
}

export function applyLexTheme(mode: ThemeMode) {
  const themeName = defineTheme(mode)
  monaco.editor.setTheme(themeName)
}

export function getThemeNameForMode(mode: ThemeMode) {
  return defineTheme(mode)
}
