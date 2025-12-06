import { describe, expect, it, beforeEach } from 'vitest'
import type { KeybindingDefinition } from './types'
import { KeybindingManager } from './manager'

const definitions: KeybindingDefinition[] = [
  {
    id: 'workspace.action',
    title: 'Workspace Action',
    category: 'Test',
    contexts: ['workspace'],
    shortcut: 'cmd+1',
  },
  {
    id: 'modal.only',
    title: 'Modal Only',
    category: 'Test',
    contexts: ['modal'],
    shortcut: 'cmd+k',
  },
]

describe('KeybindingManager', () => {
  let manager: KeybindingManager

  beforeEach(() => {
    manager = new KeybindingManager(definitions, { platform: 'mac' })
  })

  it('only matches bindings when their context is active', () => {
    const event = {
      code: 'Digit1',
      key: '1',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    }
    expect(manager.handleEvent(event)).toBeNull()
    manager.setContext('workspace', true)
    const match = manager.handleEvent(event)
    expect(match?.id).toBe('workspace.action')
  })

  it('translates cmd bindings for non-mac platforms', () => {
    const windowsManager = new KeybindingManager(definitions, { platform: 'windows' })
    windowsManager.setContext('workspace', true)
    const match = windowsManager.handleEvent({
      code: 'Digit1',
      key: '1',
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
    })
    expect(match?.id).toBe('workspace.action')
    expect(match?.shortcut.display).toBe('Ctrl+1')
  })

  it('respects overrides and disables bindings when set to null', () => {
    manager.updateOverrides({ overrides: { 'workspace.action': { mac: null } } })
    manager.setContext('workspace', true)
    const match = manager.handleEvent({
      code: 'Digit1',
      key: '1',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    })
    expect(match).toBeNull()
  })

  it('allows modal bindings even when modal context is active', () => {
    manager.setContext('workspace', true)
    manager.setContext('modal', true)
    const workspaceEvent = {
      code: 'Digit1',
      key: '1',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    }
    expect(manager.handleEvent(workspaceEvent)).toBeNull()

    const modalEvent = {
      code: 'KeyK',
      key: 'k',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    }
    const match = manager.handleEvent(modalEvent)
    expect(match?.id).toBe('modal.only')
  })
})
