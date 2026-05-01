import * as monaco from 'monaco-editor'

import {
  FALLBACK_PALETTES,
  TOKEN_RULES,
  type ColorPalette,
  type Intensity,
} from './theme-data'

export type ThemeMode = 'dark' | 'light'

type ColorKey = keyof ColorPalette | 'background' | 'lineHighlight'
type MonacoColorPalette = Record<ColorKey, string>

const CSS_COLOR_VARIABLES: Record<ColorKey, string> = {
  normal: '--monaco-color-normal',
  muted: '--monaco-color-muted',
  faint: '--monaco-color-faint',
  faintest: '--monaco-color-faintest',
  code_bg: '--monaco-color-code-bg',
  background: '--monaco-editor-background',
  lineHighlight: '--monaco-line-highlight',
}

const FALLBACK_CHROME: Record<ThemeMode, { background: string; lineHighlight: string }> = {
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

type StylesResult = { styles: CSSStyleDeclaration; cleanup?: () => void } | null

function resolveStylesForMode(mode: ThemeMode): StylesResult {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null
  }

  const root = document.documentElement
  if (!root) {
    return null
  }

  if (root.getAttribute('data-theme') === mode || !document.body) {
    return { styles: getComputedStyle(root) }
  }

  const probe = document.createElement('div')
  probe.setAttribute('data-theme', mode)
  probe.style.position = 'absolute'
  probe.style.width = '0'
  probe.style.height = '0'
  probe.style.pointerEvents = 'none'
  probe.style.visibility = 'hidden'
  probe.style.opacity = '0'
  document.body.appendChild(probe)

  return {
    styles: getComputedStyle(probe),
    cleanup: () => {
      probe.remove()
    },
  }
}

function readColorsFromCss(mode: ThemeMode): MonacoColorPalette {
  const fallback: MonacoColorPalette = {
    ...FALLBACK_PALETTES[mode],
    ...FALLBACK_CHROME[mode],
  }
  const stylesResult = resolveStylesForMode(mode)

  if (!stylesResult) {
    return fallback
  }

  const { styles, cleanup } = stylesResult
  const colors: MonacoColorPalette = { ...fallback }

  ;(Object.keys(CSS_COLOR_VARIABLES) as ColorKey[]).forEach((key) => {
    const cssVar = CSS_COLOR_VARIABLES[key]
    const value = styles.getPropertyValue(cssVar).trim()
    if (value) {
      colors[key] = value
    }
  })

  cleanup?.()

  return colors
}

function stripHash(value: string): string {
  return value.startsWith('#') ? value.slice(1) : value
}

function defineTheme(mode: ThemeMode) {
  const colors = readColorsFromCss(mode)
  const baseTheme = mode === 'dark' ? 'vs-dark' : 'vs'
  const themeName = `${THEME_NAME}-${mode}`

  const intensityColor = (intensity: Intensity): string => stripHash(colors[intensity])

  monaco.editor.defineTheme(themeName, {
    base: baseTheme,
    inherit: true,
    rules: TOKEN_RULES.map((rule) => ({
      token: rule.token,
      foreground: intensityColor(rule.intensity),
      ...(rule.fontStyle ? { fontStyle: rule.fontStyle } : {}),
      ...(rule.background ? { background: stripHash(colors[rule.background]) } : {}),
    })),
    colors: {
      'editor.foreground': colors.normal,
      'editor.background': colors.background,
      'editor.lineHighlightBackground': colors.lineHighlight,
      'editorLineNumber.foreground': colors.faint,
      'editorLineNumber.activeForeground': colors.normal,
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
