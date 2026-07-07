import { describe, it, expect } from 'vitest'
import {
  isCaseSensitiveFs,
  isPathInsideRoot,
  findBestRoot,
  routeOpenFile,
  updateRecentRoots,
  type OpenWindowState,
  type RecentRoot
} from './file-routing'

describe('isCaseSensitiveFs', () => {
  it('treats linux as case-sensitive', () => {
    expect(isCaseSensitiveFs('linux')).toBe(true)
  })

  it('treats darwin as case-insensitive', () => {
    expect(isCaseSensitiveFs('darwin')).toBe(false)
  })

  it('treats win32 as case-insensitive', () => {
    expect(isCaseSensitiveFs('win32')).toBe(false)
  })
})

describe('isPathInsideRoot', () => {
  it('returns true for file directly inside root', () => {
    expect(isPathInsideRoot('/Users/alice/docs/a.lex', '/Users/alice/docs', 'darwin')).toBe(true)
  })

  it('returns true for deeply nested file', () => {
    expect(
      isPathInsideRoot('/Users/alice/docs/nested/deep/a.lex', '/Users/alice/docs', 'darwin')
    ).toBe(true)
  })

  it('returns true when path equals root', () => {
    expect(isPathInsideRoot('/Users/alice/docs', '/Users/alice/docs', 'darwin')).toBe(true)
  })

  it('returns false for sibling paths with shared prefix', () => {
    expect(isPathInsideRoot('/Users/alice/docs2/a.lex', '/Users/alice/docs', 'darwin')).toBe(false)
  })

  it('returns false when path is outside root', () => {
    expect(isPathInsideRoot('/tmp/a.lex', '/Users/alice/docs', 'darwin')).toBe(false)
  })

  it('returns false for empty root or path', () => {
    expect(isPathInsideRoot('', '/a', 'linux')).toBe(false)
    expect(isPathInsideRoot('/a/b', '', 'linux')).toBe(false)
  })

  it('handles trailing slash on root', () => {
    expect(isPathInsideRoot('/root/a.lex', '/root/', 'linux')).toBe(true)
  })

  it('is case-insensitive on darwin', () => {
    expect(isPathInsideRoot('/USERS/Alice/Docs/a.lex', '/users/alice/docs', 'darwin')).toBe(true)
  })

  it('is case-insensitive on win32', () => {
    expect(isPathInsideRoot('/USERS/Alice/Docs/a.lex', '/users/alice/docs', 'win32')).toBe(true)
  })

  it('is case-sensitive on linux', () => {
    expect(isPathInsideRoot('/Users/Alice/docs/a.lex', '/users/alice/docs', 'linux')).toBe(false)
    expect(isPathInsideRoot('/users/alice/docs/a.lex', '/users/alice/docs', 'linux')).toBe(true)
  })

  it('normalizes relative segments', () => {
    expect(isPathInsideRoot('/a/b/../b/c.lex', '/a/b', 'linux')).toBe(true)
    expect(isPathInsideRoot('/a/b/../../c.lex', '/a/b', 'linux')).toBe(false)
  })
})

describe('findBestRoot', () => {
  it('returns null when no candidate matches', () => {
    const result = findBestRoot(
      '/foo/a.lex',
      [{ root: '/bar' }, { root: '/baz' }],
      (c) => c.root,
      () => 0,
      'linux'
    )
    expect(result).toBeNull()
  })

  it('returns the only candidate when just one matches', () => {
    const result = findBestRoot(
      '/project/a.lex',
      [{ root: '/project' }, { root: '/other' }],
      (c) => c.root,
      () => 0,
      'linux'
    )
    expect(result?.root).toBe('/project')
  })

  it('picks the longest (most-specific) matching root', () => {
    const result = findBestRoot(
      '/project/sub/a.lex',
      [{ root: '/project' }, { root: '/project/sub' }],
      (c) => c.root,
      () => 0,
      'linux'
    )
    expect(result?.root).toBe('/project/sub')
  })

  it('breaks ties by the tiebreaker score', () => {
    const result = findBestRoot(
      '/project/a.lex',
      [
        { root: '/project', score: 10 },
        { root: '/project', score: 100 },
        { root: '/project', score: 5 }
      ],
      (c) => c.root,
      (c) => c.score,
      'linux'
    )
    expect(result?.score).toBe(100)
  })

  it('skips candidates with null roots', () => {
    const result = findBestRoot(
      '/project/a.lex',
      [{ root: null }, { root: '/project' }],
      (c) => c.root,
      () => 0,
      'linux'
    )
    expect(result?.root).toBe('/project')
  })
})

describe('routeOpenFile', () => {
  const empty: RecentRoot[] = []

  it('creates a new window when no windows are open', () => {
    const route = routeOpenFile({
      filePath: '/docs/a.lex',
      openWindows: [],
      recentRoots: empty,
      platform: 'linux'
    })
    expect(route).toEqual({ kind: 'newWindow', filePath: '/docs/a.lex' })
  })

  it('picks an open window whose root contains the file', () => {
    const windows: OpenWindowState[] = [
      { windowId: 1, root: '/elsewhere' },
      { windowId: 2, root: '/docs' }
    ]
    const route = routeOpenFile({
      filePath: '/docs/a.lex',
      openWindows: windows,
      recentRoots: empty,
      platform: 'linux'
    })
    expect(route).toEqual({ kind: 'existingWindow', windowId: 2, filePath: '/docs/a.lex' })
  })

  it('prefers the longest matching open root', () => {
    const windows: OpenWindowState[] = [
      { windowId: 1, root: '/docs' },
      { windowId: 2, root: '/docs/sub' }
    ]
    const route = routeOpenFile({
      filePath: '/docs/sub/a.lex',
      openWindows: windows,
      recentRoots: empty,
      platform: 'linux'
    })
    expect(route).toMatchObject({ kind: 'existingWindow', windowId: 2 })
  })

  it('among equally-specific open roots, prefers the focused window', () => {
    const windows: OpenWindowState[] = [
      { windowId: 1, root: '/docs', lastFocusedAt: 10 },
      { windowId: 2, root: '/docs', lastFocusedAt: 5, isFocused: true }
    ]
    const route = routeOpenFile({
      filePath: '/docs/a.lex',
      openWindows: windows,
      recentRoots: empty,
      platform: 'linux'
    })
    expect(route).toMatchObject({ kind: 'existingWindow', windowId: 2 })
  })

  it('among equally-specific open roots with no focus, prefers most-recently-focused', () => {
    const windows: OpenWindowState[] = [
      { windowId: 1, root: '/docs', lastFocusedAt: 10 },
      { windowId: 2, root: '/docs', lastFocusedAt: 50 },
      { windowId: 3, root: '/docs', lastFocusedAt: 5 }
    ]
    const route = routeOpenFile({
      filePath: '/docs/a.lex',
      openWindows: windows,
      recentRoots: empty,
      platform: 'linux'
    })
    expect(route).toMatchObject({ kind: 'existingWindow', windowId: 2 })
  })

  it('falls back to a recent root if no open window matches', () => {
    const windows: OpenWindowState[] = [{ windowId: 1, root: '/unrelated' }]
    const recent: RecentRoot[] = [
      { path: '/projects/old', lastUsedAt: 1 },
      { path: '/projects/notes', lastUsedAt: 2 }
    ]
    const route = routeOpenFile({
      filePath: '/projects/notes/a.lex',
      openWindows: windows,
      recentRoots: recent,
      platform: 'linux'
    })
    expect(route).toEqual({
      kind: 'newWindowWithRoot',
      root: '/projects/notes',
      filePath: '/projects/notes/a.lex'
    })
  })

  it('among equally-specific recent roots, picks the most recently used', () => {
    const recent: RecentRoot[] = [
      { path: '/projects/notes', lastUsedAt: 10 },
      { path: '/projects/notes', lastUsedAt: 100 }
    ]
    const route = routeOpenFile({
      filePath: '/projects/notes/a.lex',
      openWindows: [],
      recentRoots: recent,
      platform: 'linux'
    })
    // newWindowWithRoot is the right kind since no windows are open
    expect(route.kind).toBe('newWindowWithRoot')
  })

  it('prefers an open match over a recent match', () => {
    const windows: OpenWindowState[] = [{ windowId: 1, root: '/projects/notes' }]
    const recent: RecentRoot[] = [{ path: '/projects/notes', lastUsedAt: 100 }]
    const route = routeOpenFile({
      filePath: '/projects/notes/a.lex',
      openWindows: windows,
      recentRoots: recent,
      platform: 'linux'
    })
    expect(route).toMatchObject({ kind: 'existingWindow', windowId: 1 })
  })

  it('falls back to focused open window when no root matches', () => {
    const windows: OpenWindowState[] = [
      { windowId: 1, root: '/projects/a', lastFocusedAt: 10 },
      { windowId: 2, root: '/projects/b', lastFocusedAt: 50, isFocused: true }
    ]
    const route = routeOpenFile({
      filePath: '/tmp/orphan.lex',
      openWindows: windows,
      recentRoots: empty,
      platform: 'linux'
    })
    expect(route).toMatchObject({ kind: 'existingWindow', windowId: 2 })
  })

  it('falls back to most-recently-focused open window when no focus flag is set', () => {
    const windows: OpenWindowState[] = [
      { windowId: 1, root: '/projects/a', lastFocusedAt: 10 },
      { windowId: 2, root: '/projects/b', lastFocusedAt: 50 }
    ]
    const route = routeOpenFile({
      filePath: '/tmp/orphan.lex',
      openWindows: windows,
      recentRoots: empty,
      platform: 'linux'
    })
    expect(route).toMatchObject({ kind: 'existingWindow', windowId: 2 })
  })

  it('treats windows with no root as non-matching but still valid fallback targets', () => {
    const windows: OpenWindowState[] = [{ windowId: 1, root: null, lastFocusedAt: 1 }]
    const route = routeOpenFile({
      filePath: '/tmp/orphan.lex',
      openWindows: windows,
      recentRoots: empty,
      platform: 'linux'
    })
    expect(route).toMatchObject({ kind: 'existingWindow', windowId: 1 })
  })

  it('honors platform case-insensitivity on darwin', () => {
    const windows: OpenWindowState[] = [{ windowId: 1, root: '/Users/Alice/Docs' }]
    const route = routeOpenFile({
      filePath: '/users/alice/docs/a.lex',
      openWindows: windows,
      recentRoots: empty,
      platform: 'darwin'
    })
    expect(route).toMatchObject({ kind: 'existingWindow', windowId: 1 })
  })
})

describe('updateRecentRoots', () => {
  it('inserts a new root at the front', () => {
    const result = updateRecentRoots([], '/projects/new', 100, 20, 'linux')
    expect(result).toEqual([{ path: '/projects/new', lastUsedAt: 100 }])
  })

  it('deduplicates same root, updating timestamp', () => {
    const existing: RecentRoot[] = [{ path: '/projects/a', lastUsedAt: 10 }]
    const result = updateRecentRoots(existing, '/projects/a', 50, 20, 'linux')
    expect(result).toEqual([{ path: '/projects/a', lastUsedAt: 50 }])
  })

  it('keeps list sorted by lastUsedAt descending', () => {
    const existing: RecentRoot[] = [
      { path: '/projects/a', lastUsedAt: 10 },
      { path: '/projects/b', lastUsedAt: 30 }
    ]
    const result = updateRecentRoots(existing, '/projects/c', 20, 20, 'linux')
    expect(result.map((r) => r.path)).toEqual(['/projects/b', '/projects/c', '/projects/a'])
  })

  it('caps the list to `max` entries', () => {
    const existing: RecentRoot[] = Array.from({ length: 5 }, (_, i) => ({
      path: `/p${i}`,
      lastUsedAt: i
    }))
    const result = updateRecentRoots(existing, '/new', 100, 3, 'linux')
    expect(result).toHaveLength(3)
    expect(result[0].path).toBe('/new')
  })

  it('deduplicates case-insensitively on darwin', () => {
    const existing: RecentRoot[] = [{ path: '/Projects/Notes', lastUsedAt: 1 }]
    const result = updateRecentRoots(existing, '/projects/notes', 50, 20, 'darwin')
    expect(result).toHaveLength(1)
    expect(result[0].lastUsedAt).toBe(50)
  })

  it('does not deduplicate case-insensitively on linux', () => {
    const existing: RecentRoot[] = [{ path: '/Projects/Notes', lastUsedAt: 1 }]
    const result = updateRecentRoots(existing, '/projects/notes', 50, 20, 'linux')
    expect(result).toHaveLength(2)
  })

  it('ignores empty newRoot', () => {
    const existing: RecentRoot[] = [{ path: '/p', lastUsedAt: 1 }]
    const result = updateRecentRoots(existing, '', 50, 20, 'linux')
    expect(result).toBe(existing)
  })
})
