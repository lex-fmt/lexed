const DEFAULT_LANGUAGE = 'plaintext'

export function getLanguageForFile(path: string): string {
  const ext = path.toLowerCase().split('.').pop()
  switch (ext) {
    case 'lex':
      return 'lex'
    case 'md':
      return 'markdown'
    case 'html':
    case 'htm':
      return 'html'
    case 'txt':
      return 'plaintext'
    default:
      return DEFAULT_LANGUAGE
  }
}

export function isLexFile(path: string | null | undefined): boolean {
  if (!path) return false
  return path.toLowerCase().endsWith('.lex')
}

export function isMarkdownFile(path: string | null | undefined): boolean {
  if (!path) return false
  const lower = path.toLowerCase()
  return lower.endsWith('.md') || lower.endsWith('.markdown')
}

export type FileActionId =
  | 'exportMarkdown'
  | 'exportHtml'
  | 'preview'
  | 'convertToLex'
  | 'format'
  | 'shareWhatsApp'
  | 'copyPath'
  | 'copyRelativePath'
  | 'revealInFolder'

export interface FileAction {
  id: FileActionId
  label: string
  enabled: boolean
}

export interface FileActions {
  exportMarkdown: FileAction
  exportHtml: FileAction
  preview: FileAction
  convertToLex: FileAction
  format: FileAction
  shareWhatsApp: FileAction
  copyPath: FileAction
  copyRelativePath: FileAction
  revealInFolder: FileAction
}

/**
 * Get available file actions for a given file path.
 * This is the shared logic used by both the toolbar and context menus.
 */
export function getFileActions(path: string | null | undefined): FileActions {
  const isLex = isLexFile(path)
  const isMd = isMarkdownFile(path)
  const hasFile = Boolean(path)

  return {
    exportMarkdown: {
      id: 'exportMarkdown',
      label: 'Export to Markdown',
      enabled: isLex,
    },
    exportHtml: {
      id: 'exportHtml',
      label: 'Export to HTML',
      enabled: isLex,
    },
    preview: {
      id: 'preview',
      label: 'Preview',
      enabled: isLex,
    },
    convertToLex: {
      id: 'convertToLex',
      label: 'Convert to Lex',
      enabled: isMd,
    },
    format: {
      id: 'format',
      label: 'Format Document',
      enabled: isLex,
    },
    shareWhatsApp: {
      id: 'shareWhatsApp',
      label: 'Share via WhatsApp',
      enabled: isLex,
    },
    copyPath: {
      id: 'copyPath',
      label: 'Copy Path',
      enabled: hasFile,
    },
    copyRelativePath: {
      id: 'copyRelativePath',
      label: 'Copy Relative Path',
      enabled: hasFile,
    },
    revealInFolder: {
      id: 'revealInFolder',
      label: 'Reveal in Finder',
      enabled: hasFile,
    },
  }
}
