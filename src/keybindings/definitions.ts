import type { KeybindingDefinition } from './types'

const paneFocusDefinitions: KeybindingDefinition[] = Array.from({ length: 9 }).map((_, index) => {
  const position = index + 1
  return {
    id: `workspace.pane.focus.${position}`,
    title: `Focus Pane ${position}`,
    description: 'Focus a specific editor pane based on its visual order',
    category: 'Workspace',
    contexts: ['workspace'],
    shortcut: `cmd+${position}`,
  }
})

export const KEYBINDING_DEFINITIONS: KeybindingDefinition[] = [
  {
    id: 'workspace.tab.next',
    title: 'Next Editor Tab',
    description: 'Move focus to the next tab (cycles across panes)',
    category: 'Navigation',
    contexts: ['workspace'],
    shortcut: 'cmd+shift+]',
  },
  {
    id: 'workspace.tab.previous',
    title: 'Previous Editor Tab',
    description: 'Move focus to the previous tab (cycles across panes)',
    category: 'Navigation',
    contexts: ['workspace'],
    shortcut: 'cmd+shift+[',
  },
  ...paneFocusDefinitions,
  {
    id: 'workspace.pane.split.horizontal',
    title: 'Split Pane Horizontally',
    description: 'Split the active pane into a new horizontal row',
    category: 'Workspace',
    contexts: ['workspace'],
    shortcut: 'cmd+shift+h',
  },
  {
    id: 'workspace.pane.split.vertical',
    title: 'Split Pane Vertically',
    description: 'Split the active pane side-by-side',
    category: 'Workspace',
    contexts: ['workspace'],
    shortcut: 'cmd+shift+v',
  },
  {
    id: 'editor.showReplace',
    title: 'Find and Replace',
    description: 'Open the replace UI in the active editor',
    category: 'Editor',
    contexts: ['editor'],
    shortcut: 'cmd+r',
  },
  {
    id: 'commandPalette.show',
    title: 'Command Palette',
    description: 'Toggle the LexEd command palette',
    category: 'General',
    contexts: ['global', 'modal'],
    shortcut: 'cmd+k',
  },
  {
    id: 'workspace.shortcuts.show',
    title: 'Show Keyboard Shortcuts',
    description: 'Display all available keyboard shortcuts',
    category: 'General',
    contexts: ['global', 'modal'],
    shortcut: 'cmd+shift+?',
  },
]
