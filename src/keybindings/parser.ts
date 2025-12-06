import type { KeybindingPlatform } from '@/settings/types'
import type { KeybindingShortcut, NormalizedKeyChord, ParsedShortcut } from './types'

const SPECIAL_KEY_CODES: Record<string, { code: string; label: string }> = {
  '[': { code: 'BracketLeft', label: '[' },
  '{': { code: 'BracketLeft', label: '[' },
  ']': { code: 'BracketRight', label: ']' },
  '}': { code: 'BracketRight', label: ']' },
  bracketleft: { code: 'BracketLeft', label: '[' },
  bracketright: { code: 'BracketRight', label: ']' },
  semicolon: { code: 'Semicolon', label: ';' },
  ';': { code: 'Semicolon', label: ';' },
  "'": { code: 'Quote', label: "'" },
  quote: { code: 'Quote', label: "'" },
  ',': { code: 'Comma', label: ',' },
  comma: { code: 'Comma', label: ',' },
  '.': { code: 'Period', label: '.' },
  period: { code: 'Period', label: '.' },
  '/': { code: 'Slash', label: '/' },
  '?': { code: 'Slash', label: '?' },
  slash: { code: 'Slash', label: '/' },
  backslash: { code: 'Backslash', label: '\\' },
  '\\': { code: 'Backslash', label: '\\' },
  '`': { code: 'Backquote', label: '`' },
  backquote: { code: 'Backquote', label: '`' },
  minus: { code: 'Minus', label: '-' },
  '-': { code: 'Minus', label: '-' },
  equal: { code: 'Equal', label: '=' },
  '=': { code: 'Equal', label: '=' },
  space: { code: 'Space', label: 'Space' },
  enter: { code: 'Enter', label: 'Enter' },
  return: { code: 'Enter', label: 'Enter' },
  escape: { code: 'Escape', label: 'Esc' },
  esc: { code: 'Escape', label: 'Esc' },
  tab: { code: 'Tab', label: 'Tab' },
  home: { code: 'Home', label: 'Home' },
  end: { code: 'End', label: 'End' },
  pageup: { code: 'PageUp', label: 'PageUp' },
  pagedown: { code: 'PageDown', label: 'PageDown' },
}

const MODIFIER_ORDER: Array<keyof NormalizedKeyChord['modifiers']> = [
  'meta',
  'ctrl',
  'alt',
  'shift',
]

const MODIFIER_LABELS: Record<
  KeybindingPlatform,
  Record<keyof NormalizedKeyChord['modifiers'], string>
> = {
  mac: {
    meta: 'Cmd',
    ctrl: 'Ctrl',
    alt: 'Option',
    shift: 'Shift',
  },
  windows: {
    meta: 'Win',
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
  },
  linux: {
    meta: 'Super',
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
  },
}

function normalizeToken(token: string): string {
  return token.trim().toLowerCase()
}

function resolveKeyToken(rawToken: string): { code: string; label: string } | null {
  const token = normalizeToken(rawToken)
  if (SPECIAL_KEY_CODES[token]) {
    return SPECIAL_KEY_CODES[token]
  }
  if (/^digit[0-9]$/.test(token)) {
    return { code: `Digit${token[token.length - 1]}`, label: token[token.length - 1].toUpperCase() }
  }
  if (/^[0-9]$/.test(token)) {
    return { code: `Digit${token}`, label: token }
  }
  if (/^key[a-z]$/.test(token)) {
    const letter = token[token.length - 1].toUpperCase()
    return { code: `Key${letter}`, label: letter }
  }
  if (/^[a-z]$/.test(token)) {
    const letter = token.toUpperCase()
    return { code: `Key${letter}`, label: letter }
  }
  if (/^f[0-9]{1,2}$/.test(token)) {
    const upper = token.toUpperCase()
    return { code: upper, label: upper }
  }
  return null
}

export function getShortcutVariants(
  shortcut: KeybindingShortcut,
  platform: KeybindingPlatform
): string[] {
  if (Array.isArray(shortcut)) {
    return shortcut.flatMap((entry) => getShortcutVariants(entry, platform))
  }
  if (typeof shortcut === 'string') {
    return shortcut ? [shortcut] : []
  }
  const platformValue = shortcut?.[platform]
  if (!platformValue) {
    return []
  }
  if (platformValue === null) {
    return []
  }
  return [platformValue]
}

function buildDisplayLabel(chord: NormalizedKeyChord, platform: KeybindingPlatform): string {
  const parts: string[] = []
  for (const key of MODIFIER_ORDER) {
    if (chord.modifiers[key]) {
      parts.push(MODIFIER_LABELS[platform][key])
    }
  }
  parts.push(chord.keyLabel)
  return parts.join('+')
}

export function parseShortcut(
  shortcut: string,
  platform: KeybindingPlatform
): ParsedShortcut | null {
  const trimmed = shortcut.trim()
  if (!trimmed) return null

  const chordStrings = trimmed.split(/\s+/)
  if (chordStrings.length > 1) {
    // Multi-chord sequences are not supported yet
    return null
  }

  const chordTokens = chordStrings[0]
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)
  const modifiers: NormalizedKeyChord['modifiers'] = {
    meta: false,
    ctrl: false,
    alt: false,
    shift: false,
  }
  let keyToken: string | null = null

  for (const raw of chordTokens) {
    const token = normalizeToken(raw)
    switch (token) {
      case 'cmd':
      case 'command':
      case 'meta':
      case 'mod':
      case 'cmdorctrl':
        if (platform === 'mac') {
          modifiers.meta = true
        } else {
          modifiers.ctrl = true
        }
        break
      case 'ctrl':
      case 'control':
        modifiers.ctrl = true
        break
      case 'alt':
      case 'option':
        modifiers.alt = true
        break
      case 'shift':
        modifiers.shift = true
        break
      case 'win':
      case 'super':
        modifiers.meta = true
        break
      default:
        keyToken = raw
        break
    }
  }

  if (!keyToken) {
    return null
  }
  const resolvedKey = resolveKeyToken(keyToken)
  if (!resolvedKey) {
    return null
  }

  const chord: NormalizedKeyChord = {
    code: resolvedKey.code,
    keyLabel: resolvedKey.label,
    modifiers,
  }

  return {
    chords: [chord],
    display: buildDisplayLabel(chord, platform),
  }
}
