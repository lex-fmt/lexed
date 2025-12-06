import type { KeybindingOverride, KeybindingPlatform, KeybindingSettings } from '@/settings/types'

export type KeybindingContext = 'global' | 'workspace' | 'editor' | 'modal'

export type KeybindingShortcut = string | KeybindingOverride | Array<string | KeybindingOverride>

export interface KeybindingDefinition {
  id: string
  title: string
  description?: string
  category: string
  contexts?: KeybindingContext[]
  shortcut: KeybindingShortcut
}

export interface KeybindingModifiers {
  meta: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
}

export interface NormalizedKeyChord {
  code: string
  keyLabel: string
  modifiers: KeybindingModifiers
}

export interface ParsedShortcut {
  chords: NormalizedKeyChord[]
  display: string
}

export interface KeybindingMatch {
  id: string
  shortcut: ParsedShortcut
}

export interface KeybindingEventInput {
  code: string
  key?: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  targetTagName?: string
}

export interface KeybindingDescriptor {
  id: string
  title: string
  description?: string
  category: string
  shortcuts: ParsedShortcut[]
}

export interface KeybindingRuntimeOptions {
  platform: KeybindingPlatform
  overrides?: KeybindingSettings
}
