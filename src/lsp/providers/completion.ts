import * as monaco from 'monaco-editor'
import { ProtocolConnection } from 'vscode-languageserver-protocol/browser'
import { LspCompletionItem, LspCompletionResponse } from '../types'
import { getSettingsSnapshot } from '@/settings/snapshot'

const PATH_REFERENCE_DETAIL = 'path reference'

const PATH_STOP_CHAR = new RegExp('[\\s,;(){}\\[\\]]')

interface PathInfo {
  drive: string
  leadingSlash: boolean
  segments: string[]
}

const normalizePath = (value: string): string => value.replace(/\\/g, '/')

const splitPathSegments = (value: string): PathInfo => {
  const normalized = normalizePath(value)
  const driveMatch = normalized.match(/^([a-zA-Z]:)/)
  let pathWithoutDrive = normalized
  let drive = ''
  if (driveMatch) {
    drive = driveMatch[1]
    pathWithoutDrive = normalized.slice(drive.length)
  }
  const leadingSlash = pathWithoutDrive.startsWith('/')
  let trimmed = pathWithoutDrive
  while (trimmed.startsWith('/')) {
    trimmed = trimmed.slice(1)
  }
  while (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1)
  }
  const segments = trimmed.length > 0 ? trimmed.split('/') : []
  return { drive, leadingSlash, segments }
}

const buildAbsolutePath = (info: PathInfo, segments: string[]): string => {
  const prefix = info.drive ? info.drive : info.leadingSlash ? '/' : ''
  return segments.length > 0 ? `${prefix}${segments.join('/')}` : prefix || '/'
}

const resolveWithRoot = (root: string, relativePath: string): string => {
  if (!relativePath) return normalizePath(root)
  const normalizedRelative = normalizePath(relativePath)
  if (/^[a-zA-Z]:/.test(normalizedRelative) || normalizedRelative.startsWith('/')) {
    return normalizedRelative
  }
  const rootInfo = splitPathSegments(root)
  const resultSegments = [...rootInfo.segments]
  const relativeSegments = normalizedRelative.split('/').filter(Boolean)
  for (const segment of relativeSegments) {
    if (segment === '..') {
      if (resultSegments.length > 0) {
        resultSegments.pop()
      }
    } else if (segment !== '.') {
      resultSegments.push(segment)
    }
  }
  return buildAbsolutePath(rootInfo, resultSegments)
}

const relativeBetween = (fromPath: string, toPath: string): string => {
  const fromInfo = splitPathSegments(fromPath)
  const toInfo = splitPathSegments(toPath)
  if (
    fromInfo.drive &&
    toInfo.drive &&
    fromInfo.drive.toLowerCase() !== toInfo.drive.toLowerCase()
  ) {
    return normalizePath(toPath)
  }
  const fromSegments = fromInfo.segments
  const toSegments = toInfo.segments
  let common = 0
  while (
    common < fromSegments.length &&
    common < toSegments.length &&
    fromSegments[common] === toSegments[common]
  ) {
    common++
  }
  const upLevels = fromSegments.length - common
  const relativeSegments = [] as string[]
  for (let i = 0; i < upLevels; i++) {
    relativeSegments.push('..')
  }
  relativeSegments.push(...toSegments.slice(common))
  const relativePath = relativeSegments.join('/')
  return relativePath || '.'
}

const getDirname = (fsPath: string | null | undefined): string | null => {
  if (!fsPath) return null
  let normalized = normalizePath(fsPath)
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  const idx = normalized.lastIndexOf('/')
  if (idx === -1) return null
  return idx === 0 ? '/' : normalized.slice(0, idx)
}

const isPathCompletionItem = (item: LspCompletionItem) => item.detail === PATH_REFERENCE_DETAIL

const computeRelativeInsertText = (
  insertText: string | undefined,
  label: string | undefined,
  modelDir: string | null,
  workspaceRoot: string | undefined
) => {
  if (!insertText || !label || !modelDir || !workspaceRoot) {
    return insertText
  }
  const absoluteTarget = resolveWithRoot(workspaceRoot, label)
  return relativeBetween(modelDir, absoluteTarget)
}

if (typeof window !== 'undefined') {
  ;(window as { __lexPathTestHelpers?: { computeRelativeInsertText: typeof computeRelativeInsertText } }).__lexPathTestHelpers = {
    computeRelativeInsertText,
  }
}

const getPathCompletionContext = (model: monaco.editor.ITextModel, position: monaco.Position) => {
  const line = model.getLineContent(position.lineNumber)
  if (!line) return null
  let index = position.column - 2
  while (index >= 0) {
    const char = line[index]
    if (char === '@') {
      return true
    }
    if (PATH_STOP_CHAR.test(char)) {
      return null
    }
    index--
  }
  return null
}

export function registerCompletionProvider(languageId: string, connection: ProtocolConnection) {
  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['@', '[', ':', '='],
    provideCompletionItems: async (model, position, context) => {
      if (!connection) return { suggestions: [] }

      const isPathContext = Boolean(getPathCompletionContext(model, position))
      const modelFsPath = model.uri?.fsPath ?? model.uri?.path ?? null
      const modelDir = getDirname(modelFsPath)
      const workspaceRoot = getSettingsSnapshot().lastFolder ?? (typeof window !== 'undefined' ? (window as { __lexWorkspaceRoot?: string }).__lexWorkspaceRoot : undefined)

      const params = {
        textDocument: { uri: model.uri.toString() },
        position: { line: position.lineNumber - 1, character: position.column - 1 },
        context: {
          triggerKind:
            context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter ? 2 : 1,
          triggerCharacter: context.triggerCharacter,
        },
      }

      try {
        const result = (await connection.sendRequest(
          'textDocument/completion',
          params
        )) as LspCompletionResponse | null
        if (!result) return { suggestions: [] }
        const items: LspCompletionItem[] = Array.isArray(result) ? result : result.items
        const filteredItems = items.filter((item) => isPathContext || !isPathCompletionItem(item))
        if (typeof window !== 'undefined') {
          ;(
            window as unknown as { __lexCompletionSample?: LspCompletionItem[] }
          ).__lexCompletionSample = filteredItems
        }
        if (filteredItems.length === 0) {
          return { suggestions: [] }
        }
        // Default range: replace word at cursor
        const word = model.getWordUntilPosition(position)
        const defaultRange: monaco.IRange = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn,
        }
        return {
          suggestions: filteredItems.map((item) => {
            const isPathCompletion = isPathCompletionItem(item)
            let insertText = item.insertText || item.label
            if (
              isPathContext &&
              isPathCompletion &&
              insertText &&
              modelDir &&
              workspaceRoot &&
              item.label
            ) {
              const absoluteTarget = resolveWithRoot(workspaceRoot, item.label)
              insertText = relativeBetween(modelDir, absoluteTarget)
            }
            return {
              label: item.label,
              kind: item.kind ? item.kind - 1 : monaco.languages.CompletionItemKind.Text,
              insertText,
              insertTextRules:
                item.insertTextFormat === 2
                  ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                  : undefined,
              documentation: item.documentation,
              detail: item.detail,
              range: item.textEdit
                ? {
                    startLineNumber: item.textEdit.range.start.line + 1,
                    startColumn: item.textEdit.range.start.character + 1,
                    endLineNumber: item.textEdit.range.end.line + 1,
                    endColumn: item.textEdit.range.end.character + 1,
                  }
                : defaultRange,
            }
          }),
        }
      } catch (e) {
        console.error('[LSP] Completion failed:', e)
        return { suggestions: [] }
      }
    },
  })
}
