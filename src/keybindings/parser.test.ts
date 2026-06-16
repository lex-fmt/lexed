import { describe, expect, it } from 'vitest'
import { getShortcutVariants, parseShortcut } from './parser'
import type { KeybindingShortcut } from './types'

describe('parseShortcut', () => {
  it('parses bracket shortcuts across platforms', () => {
    const mac = parseShortcut('cmd+shift+]', 'mac')
    expect(mac).toBeTruthy()
    expect(mac?.chords[0].code).toBe('BracketRight')
    expect(mac?.chords[0].modifiers.meta).toBe(true)
    expect(mac?.chords[0].modifiers.shift).toBe(true)
    expect(mac?.display).toBe('Cmd+Shift+]')

    const win = parseShortcut('cmd+shift+]', 'windows')
    expect(win).toBeTruthy()
    expect(win?.chords[0].code).toBe('BracketRight')
    expect(win?.chords[0].modifiers.ctrl).toBe(true)
    expect(win?.chords[0].modifiers.meta).toBe(false)
    expect(win?.display).toBe('Ctrl+Shift+]')
  })

  it('parses punctuation shortcuts like slash/question mark', () => {
    const parsed = parseShortcut('cmd+shift+/', 'mac')
    expect(parsed).toBeTruthy()
    expect(parsed?.chords[0].code).toBe('Slash')
    expect(parsed?.chords[0].modifiers.meta).toBe(true)
    expect(parsed?.chords[0].modifiers.shift).toBe(true)
    expect(parsed?.display).toBe('Cmd+Shift+/')
  })

  it('supports digit shortcuts', () => {
    const parsed = parseShortcut('cmd+2', 'mac')
    expect(parsed?.chords[0].code).toBe('Digit2')
    expect(parsed?.chords[0].modifiers.meta).toBe(true)
    expect(parsed?.display).toBe('Cmd+2')
  })

  describe('empty / invalid input', () => {
    it('returns null for an empty shortcut string', () => {
      expect(parseShortcut('', 'mac')).toBeNull()
    })

    it('returns null for a whitespace-only shortcut', () => {
      expect(parseShortcut('   \t  ', 'mac')).toBeNull()
    })

    it('returns null when only modifiers are given (no key token)', () => {
      expect(parseShortcut('cmd+shift', 'mac')).toBeNull()
      expect(parseShortcut('ctrl+alt+shift', 'windows')).toBeNull()
    })

    it('returns null for an unresolvable key token', () => {
      expect(parseShortcut('cmd+foobar', 'mac')).toBeNull()
      // Two-letter "key" without the `key` prefix doesn't match /^[a-z]$/
      expect(parseShortcut('cmd+ab', 'mac')).toBeNull()
    })

    it('returns null for multi-chord sequences (not yet supported)', () => {
      expect(parseShortcut('cmd+k cmd+s', 'mac')).toBeNull()
    })
  })

  describe('modifier aliases', () => {
    it('treats cmd / command / meta / mod / cmdorctrl as meta on mac', () => {
      for (const alias of ['cmd', 'command', 'meta', 'mod', 'cmdorctrl']) {
        const parsed = parseShortcut(`${alias}+a`, 'mac')
        expect(parsed, alias).toBeTruthy()
        expect(parsed?.chords[0].modifiers.meta, alias).toBe(true)
        expect(parsed?.chords[0].modifiers.ctrl, alias).toBe(false)
      }
    })

    it('translates cmd / command / meta / mod / cmdorctrl to ctrl on windows and linux', () => {
      for (const platform of ['windows', 'linux'] as const) {
        for (const alias of ['cmd', 'command', 'meta', 'mod', 'cmdorctrl']) {
          const parsed = parseShortcut(`${alias}+a`, platform)
          expect(parsed, `${platform}/${alias}`).toBeTruthy()
          expect(parsed?.chords[0].modifiers.ctrl, `${platform}/${alias}`).toBe(true)
          expect(parsed?.chords[0].modifiers.meta, `${platform}/${alias}`).toBe(false)
        }
      }
    })

    it('treats both "ctrl" and "control" as ctrl', () => {
      expect(parseShortcut('ctrl+a', 'mac')?.chords[0].modifiers.ctrl).toBe(true)
      expect(parseShortcut('control+a', 'mac')?.chords[0].modifiers.ctrl).toBe(true)
    })

    it('treats both "alt" and "option" as alt', () => {
      expect(parseShortcut('alt+a', 'mac')?.chords[0].modifiers.alt).toBe(true)
      expect(parseShortcut('option+a', 'mac')?.chords[0].modifiers.alt).toBe(true)
    })

    it('treats both "win" and "super" as meta on every platform', () => {
      for (const platform of ['mac', 'windows', 'linux'] as const) {
        expect(parseShortcut('win+a', platform)?.chords[0].modifiers.meta, platform).toBe(true)
        expect(parseShortcut('super+a', platform)?.chords[0].modifiers.meta, platform).toBe(true)
      }
    })

    it('is case-insensitive for modifier names', () => {
      const parsed = parseShortcut('CMD+SHIFT+A', 'mac')
      expect(parsed?.chords[0].modifiers.meta).toBe(true)
      expect(parsed?.chords[0].modifiers.shift).toBe(true)
      expect(parsed?.chords[0].code).toBe('KeyA')
    })

    it('trims leading and trailing whitespace around the whole shortcut', () => {
      const parsed = parseShortcut('   cmd+shift+a   ', 'mac')
      expect(parsed).toBeTruthy()
      expect(parsed?.chords[0].modifiers.meta).toBe(true)
      expect(parsed?.chords[0].modifiers.shift).toBe(true)
      expect(parsed?.chords[0].code).toBe('KeyA')
    })

    it('treats internal whitespace as a chord separator (multi-chord, currently unsupported)', () => {
      // Internal whitespace is the chord-separator: `cmd + a` becomes the
      // sequence cmd / + / a which the parser rejects as multi-chord. Pin
      // this in a test so it changes deliberately if multi-chord lands.
      expect(parseShortcut('cmd + a', 'mac')).toBeNull()
    })

    it('ignores empty segments produced by repeated "+" separators', () => {
      const parsed = parseShortcut('cmd++a', 'mac')
      expect(parsed).toBeTruthy()
      expect(parsed?.chords[0].code).toBe('KeyA')
      expect(parsed?.chords[0].modifiers.meta).toBe(true)
    })
  })

  describe('key resolution', () => {
    it('resolves a bare letter to KeyX', () => {
      const parsed = parseShortcut('cmd+a', 'mac')
      expect(parsed?.chords[0].code).toBe('KeyA')
      expect(parsed?.chords[0].keyLabel).toBe('A')
    })

    it('resolves the prefixed "keyX" form to KeyX', () => {
      const parsed = parseShortcut('cmd+keyq', 'mac')
      expect(parsed?.chords[0].code).toBe('KeyQ')
      expect(parsed?.chords[0].keyLabel).toBe('Q')
    })

    it('resolves a bare digit to DigitN', () => {
      const parsed = parseShortcut('cmd+7', 'mac')
      expect(parsed?.chords[0].code).toBe('Digit7')
      expect(parsed?.chords[0].keyLabel).toBe('7')
    })

    it('resolves the prefixed "digitN" form to DigitN', () => {
      const parsed = parseShortcut('cmd+digit4', 'mac')
      expect(parsed?.chords[0].code).toBe('Digit4')
      expect(parsed?.chords[0].keyLabel).toBe('4')
    })

    it('resolves function keys (any 1-2 digit F-key)', () => {
      // The parser regex is /^f[0-9]{1,2}$/, so F1 through F99 all resolve —
      // not just the common F1..F12. Sample across the range to pin this.
      for (const n of [1, 5, 9, 12, 19, 24, 99]) {
        const parsed = parseShortcut(`cmd+f${n}`, 'mac')
        expect(parsed?.chords[0].code, `F${n}`).toBe(`F${n}`)
        expect(parsed?.chords[0].keyLabel, `F${n}`).toBe(`F${n}`)
      }
    })

    it('rejects three-digit function-key tokens (regex caps at 2 digits)', () => {
      expect(parseShortcut('cmd+f100', 'mac')).toBeNull()
    })

    it('resolves named navigation/editing keys', () => {
      const cases: Array<[string, string, string]> = [
        ['enter', 'Enter', 'Enter'],
        ['return', 'Enter', 'Enter'],
        ['escape', 'Escape', 'Esc'],
        ['esc', 'Escape', 'Esc'],
        ['tab', 'Tab', 'Tab'],
        ['space', 'Space', 'Space'],
        ['home', 'Home', 'Home'],
        ['end', 'End', 'End'],
        ['pageup', 'PageUp', 'PageUp'],
        ['pagedown', 'PageDown', 'PageDown'],
      ]
      for (const [token, code, label] of cases) {
        const parsed = parseShortcut(`cmd+${token}`, 'mac')
        expect(parsed?.chords[0].code, token).toBe(code)
        expect(parsed?.chords[0].keyLabel, token).toBe(label)
      }
    })

    it('normalises matching bracket pairs to the same code', () => {
      // `{` / `[` and `}` / `]` map to the same KeyboardEvent.code. The parser
      // does NOT synthesise an implicit shift modifier from `{` or `}` — the
      // shift state has to be written in the shortcut string explicitly.
      const brackOpenBrace = parseShortcut('cmd+{', 'mac')
      const brackOpenSqr = parseShortcut('cmd+[', 'mac')
      expect(brackOpenBrace?.chords[0].code).toBe('BracketLeft')
      expect(brackOpenBrace?.chords[0].modifiers.shift).toBe(false)
      expect(brackOpenSqr?.chords[0].code).toBe('BracketLeft')
      expect(brackOpenSqr?.chords[0].modifiers.shift).toBe(false)

      const brackCloseBrace = parseShortcut('cmd+}', 'mac')
      const brackCloseSqr = parseShortcut('cmd+]', 'mac')
      expect(brackCloseBrace?.chords[0].code).toBe('BracketRight')
      expect(brackCloseBrace?.chords[0].modifiers.shift).toBe(false)
      expect(brackCloseSqr?.chords[0].code).toBe('BracketRight')
      expect(brackCloseSqr?.chords[0].modifiers.shift).toBe(false)
    })

    it('normalises named punctuation tokens (semicolon, quote, backslash, backquote)', () => {
      expect(parseShortcut('cmd+semicolon', 'mac')?.chords[0].code).toBe('Semicolon')
      expect(parseShortcut('cmd+;', 'mac')?.chords[0].code).toBe('Semicolon')
      expect(parseShortcut("cmd+'", 'mac')?.chords[0].code).toBe('Quote')
      expect(parseShortcut('cmd+quote', 'mac')?.chords[0].code).toBe('Quote')
      expect(parseShortcut('cmd+backslash', 'mac')?.chords[0].code).toBe('Backslash')
      expect(parseShortcut('cmd+\\', 'mac')?.chords[0].code).toBe('Backslash')
      expect(parseShortcut('cmd+backquote', 'mac')?.chords[0].code).toBe('Backquote')
      expect(parseShortcut('cmd+`', 'mac')?.chords[0].code).toBe('Backquote')
    })

    it('normalises minus and equal tokens', () => {
      expect(parseShortcut('cmd+minus', 'mac')?.chords[0].code).toBe('Minus')
      expect(parseShortcut('cmd+-', 'mac')?.chords[0].code).toBe('Minus')
      expect(parseShortcut('cmd+equal', 'mac')?.chords[0].code).toBe('Equal')
      expect(parseShortcut('cmd+=', 'mac')?.chords[0].code).toBe('Equal')
    })
  })

  describe('display formatting', () => {
    it('orders modifiers as meta, ctrl, alt, shift on mac', () => {
      // Throw the modifiers in deliberately reversed order to make sure the
      // display string follows MODIFIER_ORDER rather than input order.
      const parsed = parseShortcut('shift+alt+ctrl+cmd+a', 'mac')
      expect(parsed?.display).toBe('Cmd+Ctrl+Option+Shift+A')
    })

    it('uses platform-appropriate modifier labels', () => {
      expect(parseShortcut('alt+a', 'mac')?.display).toBe('Option+A')
      expect(parseShortcut('alt+a', 'windows')?.display).toBe('Alt+A')
      expect(parseShortcut('alt+a', 'linux')?.display).toBe('Alt+A')

      expect(parseShortcut('win+a', 'linux')?.display).toBe('Super+A')
      expect(parseShortcut('win+a', 'windows')?.display).toBe('Win+A')
    })

    it('renders a function key in its uppercase form', () => {
      expect(parseShortcut('f5', 'mac')?.display).toBe('F5')
    })

    it('renders a chord with no modifiers as just the key label', () => {
      expect(parseShortcut('escape', 'mac')?.display).toBe('Esc')
    })
  })
})

describe('getShortcutVariants', () => {
  it('returns a single-element list for a plain string shortcut', () => {
    expect(getShortcutVariants('cmd+a', 'mac')).toEqual(['cmd+a'])
  })

  it('returns an empty list for an empty string', () => {
    expect(getShortcutVariants('', 'mac')).toEqual([])
  })

  it('picks the platform value out of a per-platform object', () => {
    const shortcut: KeybindingShortcut = { mac: 'cmd+a', windows: 'ctrl+a', linux: 'ctrl+a' }
    expect(getShortcutVariants(shortcut, 'mac')).toEqual(['cmd+a'])
    expect(getShortcutVariants(shortcut, 'windows')).toEqual(['ctrl+a'])
    expect(getShortcutVariants(shortcut, 'linux')).toEqual(['ctrl+a'])
  })

  it('returns an empty list when the requested platform has no binding', () => {
    const shortcut: KeybindingShortcut = { mac: 'cmd+a' }
    expect(getShortcutVariants(shortcut, 'windows')).toEqual([])
  })

  it('returns an empty list when the platform binding is explicitly null (disabled)', () => {
    const shortcut: KeybindingShortcut = { mac: null }
    expect(getShortcutVariants(shortcut, 'mac')).toEqual([])
  })

  it('returns an empty list when the platform binding is the empty string', () => {
    const shortcut: KeybindingShortcut = { mac: '' }
    expect(getShortcutVariants(shortcut, 'mac')).toEqual([])
  })

  it('flattens a mixed array of strings and per-platform objects', () => {
    const shortcut: KeybindingShortcut = [
      'cmd+a',
      { mac: 'cmd+b', windows: 'ctrl+b', linux: 'ctrl+b' },
      { mac: null, windows: 'ctrl+c', linux: 'ctrl+c' },
      '',
    ]
    expect(getShortcutVariants(shortcut, 'mac')).toEqual(['cmd+a', 'cmd+b'])
    expect(getShortcutVariants(shortcut, 'windows')).toEqual(['cmd+a', 'ctrl+b', 'ctrl+c'])
  })

  it('returns an empty list for an empty array', () => {
    expect(getShortcutVariants([], 'mac')).toEqual([])
  })
})
