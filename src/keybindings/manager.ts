import type {
  KeybindingContext,
  KeybindingDefinition,
  KeybindingDescriptor,
  KeybindingEventInput,
  KeybindingMatch,
  KeybindingRuntimeOptions,
  ParsedShortcut,
} from './types'
import { getShortcutVariants, parseShortcut } from './parser'

interface BindingEntry {
  id: string
  contexts: KeybindingContext[]
  shortcut: ParsedShortcut
}

export class KeybindingManager {
  private readonly definitions: KeybindingDefinition[]
  private readonly platform: KeybindingRuntimeOptions['platform']
  private overrides?: KeybindingRuntimeOptions['overrides']
  private bindingsByCode = new Map<string, BindingEntry[]>()
  private descriptors = new Map<string, KeybindingDescriptor>()
  private activeContexts = new Set<KeybindingContext>()

  constructor(definitions: KeybindingDefinition[], options: KeybindingRuntimeOptions) {
    this.definitions = definitions
    this.platform = options.platform
    this.overrides = options.overrides
    this.buildBindings()
  }

  public updateOverrides(overrides?: KeybindingRuntimeOptions['overrides']) {
    this.overrides = overrides
    this.buildBindings()
  }

  public setContext(context: KeybindingContext, value: boolean) {
    if (value) {
      this.activeContexts.add(context)
    } else {
      this.activeContexts.delete(context)
    }
  }

  public getDescriptors(): KeybindingDescriptor[] {
    return Array.from(this.descriptors.values()).sort((a, b) => {
      if (a.category === b.category) {
        return a.title.localeCompare(b.title)
      }
      return a.category.localeCompare(b.category)
    })
  }

  public handleEvent(input: KeybindingEventInput): KeybindingMatch | null {
    const entries = this.bindingsByCode.get(input.code)
    if (!entries?.length) {
      return null
    }
    const modalActive = this.activeContexts.has('modal')
    for (const entry of entries) {
      if (modalActive && !entry.contexts.includes('modal')) {
        continue
      }
      if (!this.isContextActive(entry.contexts)) {
        continue
      }
      const chord = entry.shortcut.chords[0]
      if (!chord) {
        continue
      }
      if (
        chord.modifiers.meta === input.metaKey &&
        chord.modifiers.ctrl === input.ctrlKey &&
        chord.modifiers.alt === input.altKey &&
        chord.modifiers.shift === input.shiftKey
      ) {
        return { id: entry.id, shortcut: entry.shortcut }
      }
    }
    return null
  }

  private isContextActive(contexts: KeybindingContext[]): boolean {
    if (contexts.length === 0 || contexts.includes('global')) {
      return true
    }
    return contexts.some((ctx) => this.activeContexts.has(ctx))
  }

  private buildBindings() {
    this.bindingsByCode.clear()
    this.descriptors.clear()

    for (const definition of this.definitions) {
      const shortcuts = this.resolveShortcuts(definition)
      const descriptor: KeybindingDescriptor = {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        category: definition.category,
        shortcuts,
      }
      this.descriptors.set(definition.id, descriptor)

      for (const shortcut of shortcuts) {
        const chord = shortcut.chords[0]
        if (!chord) continue
        const list = this.bindingsByCode.get(chord.code) ?? []
        list.push({
          id: definition.id,
          contexts: definition.contexts?.length ? definition.contexts : ['global'],
          shortcut,
        })
        this.bindingsByCode.set(chord.code, list)
      }
    }
  }

  private resolveShortcuts(definition: KeybindingDefinition): ParsedShortcut[] {
    const overrideSpec = this.overrides?.overrides?.[definition.id]
    const overrideValue = overrideSpec?.[this.platform]
    if (overrideValue === null) {
      return []
    }
    if (overrideValue) {
      const parsed = parseShortcut(overrideValue, this.platform)
      return parsed ? [parsed] : []
    }

    const variants = getShortcutVariants(definition.shortcut, this.platform)
    const parsedVariants: ParsedShortcut[] = []
    for (const variant of variants) {
      const parsed = parseShortcut(variant, this.platform)
      if (parsed) {
        parsedVariants.push(parsed)
      }
    }
    return parsedVariants
  }
}
