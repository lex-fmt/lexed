import { describe, it, expect } from 'vitest'
import {
  getLanguageForFile,
  isLexFile,
  isMarkdownFile,
  getFileActions,
  type FileActionId,
} from '@/lib/files'

describe('getLanguageForFile', () => {
  it('maps .lex and .lexd to the lex language', () => {
    expect(getLanguageForFile('notes.lex')).toBe('lex')
    expect(getLanguageForFile('notes.lexd')).toBe('lex')
  })

  it('maps markdown, html, and txt extensions', () => {
    expect(getLanguageForFile('readme.md')).toBe('markdown')
    expect(getLanguageForFile('page.html')).toBe('html')
    expect(getLanguageForFile('page.htm')).toBe('html')
    expect(getLanguageForFile('log.txt')).toBe('plaintext')
  })

  it('is case-insensitive about the extension', () => {
    expect(getLanguageForFile('NOTES.LEX')).toBe('lex')
    expect(getLanguageForFile('README.MD')).toBe('markdown')
    expect(getLanguageForFile('PAGE.HTML')).toBe('html')
  })

  it('falls back to plaintext for unknown or absent extensions', () => {
    expect(getLanguageForFile('archive.tar.gz')).toBe('plaintext')
    expect(getLanguageForFile('Makefile')).toBe('plaintext')
    expect(getLanguageForFile('')).toBe('plaintext')
  })

  it('uses only the final extension of a multi-dotted path', () => {
    expect(getLanguageForFile('my.notes.backup.lex')).toBe('lex')
    expect(getLanguageForFile('a.lex.txt')).toBe('plaintext')
  })

  it('respects the extension even on a full directory path', () => {
    expect(getLanguageForFile('/home/me/docs/spec.lexd')).toBe('lex')
  })
})

describe('isLexFile', () => {
  it('recognizes .lex and .lexd regardless of case', () => {
    expect(isLexFile('a.lex')).toBe(true)
    expect(isLexFile('a.lexd')).toBe(true)
    expect(isLexFile('A.LEX')).toBe(true)
    expect(isLexFile('A.LexD')).toBe(true)
  })

  it('rejects non-lex files', () => {
    expect(isLexFile('a.md')).toBe(false)
    expect(isLexFile('a.txt')).toBe(false)
    // .lexd is lex but a name merely containing "lex" mid-string is not
    expect(isLexFile('lexicon.json')).toBe(false)
  })

  it('treats null/undefined/empty as not a lex file', () => {
    expect(isLexFile(null)).toBe(false)
    expect(isLexFile(undefined)).toBe(false)
    expect(isLexFile('')).toBe(false)
  })
})

describe('isMarkdownFile', () => {
  it('recognizes .md and .markdown regardless of case', () => {
    expect(isMarkdownFile('a.md')).toBe(true)
    expect(isMarkdownFile('a.markdown')).toBe(true)
    expect(isMarkdownFile('README.MD')).toBe(true)
    expect(isMarkdownFile('NOTES.Markdown')).toBe(true)
  })

  it('rejects non-markdown files', () => {
    expect(isMarkdownFile('a.lex')).toBe(false)
    expect(isMarkdownFile('a.mdx')).toBe(false)
    expect(isMarkdownFile('a.txt')).toBe(false)
  })

  it('treats null/undefined/empty as not a markdown file', () => {
    expect(isMarkdownFile(null)).toBe(false)
    expect(isMarkdownFile(undefined)).toBe(false)
    expect(isMarkdownFile('')).toBe(false)
  })
})

describe('getFileActions', () => {
  const LEX_ONLY: FileActionId[] = [
    'exportMarkdown',
    'exportHtml',
    'preview',
    'format',
    'shareWhatsApp',
  ]
  const HAS_FILE: FileActionId[] = ['copyPath', 'copyRelativePath', 'revealInFolder']

  it('enables lex-only and has-file actions for a lex file, but not convertToLex', () => {
    const actions = getFileActions('doc.lex')
    for (const id of LEX_ONLY) {
      expect(actions[id].enabled, `${id} should be enabled for lex`).toBe(true)
    }
    for (const id of HAS_FILE) {
      expect(actions[id].enabled, `${id} should be enabled when a file exists`).toBe(true)
    }
    expect(actions.convertToLex.enabled).toBe(false)
  })

  it('enables convertToLex and has-file actions for a markdown file, but not lex-only actions', () => {
    const actions = getFileActions('doc.md')
    expect(actions.convertToLex.enabled).toBe(true)
    for (const id of LEX_ONLY) {
      expect(actions[id].enabled, `${id} should be disabled for markdown`).toBe(false)
    }
    for (const id of HAS_FILE) {
      expect(actions[id].enabled, `${id} should be enabled when a file exists`).toBe(true)
    }
  })

  it('enables only has-file actions for a plain non-lex/non-markdown file', () => {
    const actions = getFileActions('notes.txt')
    expect(actions.convertToLex.enabled).toBe(false)
    for (const id of LEX_ONLY) {
      expect(actions[id].enabled).toBe(false)
    }
    for (const id of HAS_FILE) {
      expect(actions[id].enabled).toBe(true)
    }
  })

  it('disables every action when there is no file path', () => {
    for (const path of [null, undefined, '']) {
      const actions = getFileActions(path)
      for (const action of Object.values(actions)) {
        expect(action.enabled, `${action.id} should be disabled for ${String(path)}`).toBe(false)
      }
    }
  })

  it('returns every action with its own id matching its key (no copy/paste drift)', () => {
    const actions = getFileActions('doc.lex')
    for (const [key, action] of Object.entries(actions)) {
      expect(action.id).toBe(key)
      expect(typeof action.label).toBe('string')
      expect(action.label.length).toBeGreaterThan(0)
    }
  })
})
