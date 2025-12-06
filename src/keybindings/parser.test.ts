import { describe, expect, it } from 'vitest'
import { parseShortcut } from './parser'

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
})
