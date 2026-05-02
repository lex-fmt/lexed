import { describe, it, expect } from 'vitest'
import {
  appendFilesToWindowPaneLayout,
  dedupePreservingOrder,
  upsertWindowState,
  mergeBounds,
  setWindowFolder,
  setWindowPaneLayout,
} from './window-state'
import type { WindowState } from './window-manager'

const defaultBounds = { width: 1200, height: 800 }

describe('upsertWindowState', () => {
  it('creates a new entry when stateId is missing', () => {
    const result = upsertWindowState(
      [],
      'abc',
      { lastFolder: '/docs' },
      { width: 1200, height: 800 }
    )
    expect(result).toEqual([{ id: 'abc', width: 1200, height: 800, lastFolder: '/docs' }])
  })

  it('patches an existing entry without dropping other fields', () => {
    const existing: WindowState[] = [
      {
        id: 'abc',
        x: 100,
        y: 50,
        width: 800,
        height: 600,
        isMaximized: false,
        lastFolder: '/old',
      },
    ]
    const result = upsertWindowState(
      existing,
      'abc',
      { lastFolder: '/new' },
      { width: 1200, height: 800 }
    )
    expect(result).toEqual([
      {
        id: 'abc',
        x: 100,
        y: 50,
        width: 800,
        height: 600,
        isMaximized: false,
        lastFolder: '/new',
      },
    ])
  })

  it('does not mutate the input array', () => {
    const existing: WindowState[] = [{ id: 'abc', width: 800, height: 600 }]
    upsertWindowState(existing, 'xyz', { lastFolder: '/x' }, { width: 1200, height: 800 })
    expect(existing).toHaveLength(1)
  })
})

describe('mergeBounds', () => {
  it('updates bounds on existing entry while preserving lastFolder', () => {
    const existing: WindowState[] = [
      {
        id: 'abc',
        x: 10,
        y: 20,
        width: 800,
        height: 600,
        isMaximized: false,
        lastFolder: '/docs',
      },
    ]
    const result = mergeBounds(existing, 'abc', {
      x: 200,
      y: 100,
      width: 1400,
      height: 900,
      isMaximized: false,
    })
    expect(result[0]).toEqual({
      id: 'abc',
      x: 200,
      y: 100,
      width: 1400,
      height: 900,
      isMaximized: false,
      lastFolder: '/docs',
    })
  })

  it('clears x/y when maximized', () => {
    const existing: WindowState[] = [
      {
        id: 'abc',
        x: 10,
        y: 20,
        width: 800,
        height: 600,
        isMaximized: false,
        lastFolder: '/docs',
      },
    ]
    const result = mergeBounds(existing, 'abc', {
      x: 200,
      y: 100,
      width: 1400,
      height: 900,
      isMaximized: true,
    })
    expect(result[0].x).toBeUndefined()
    expect(result[0].y).toBeUndefined()
    expect(result[0].isMaximized).toBe(true)
    expect(result[0].lastFolder).toBe('/docs')
  })

  it('creates a new entry if stateId is not present', () => {
    const result = mergeBounds([], 'abc', {
      x: 200,
      y: 100,
      width: 1400,
      height: 900,
      isMaximized: false,
    })
    expect(result).toEqual([
      {
        id: 'abc',
        x: 200,
        y: 100,
        width: 1400,
        height: 900,
        isMaximized: false,
      },
    ])
  })
})

describe('setWindowFolder', () => {
  it('persists folder on a brand-new window (the bug we are fixing)', () => {
    const result = setWindowFolder([], 'abc', '/docs', defaultBounds)
    expect(result).toEqual([{ id: 'abc', width: 1200, height: 800, lastFolder: '/docs' }])
  })

  it('updates folder on an existing window', () => {
    const existing: WindowState[] = [{ id: 'abc', width: 800, height: 600, lastFolder: '/old' }]
    const result = setWindowFolder(existing, 'abc', '/new', defaultBounds)
    expect(result[0].lastFolder).toBe('/new')
    expect(result[0].width).toBe(800)
  })

  it('does not touch unrelated entries', () => {
    const existing: WindowState[] = [
      { id: 'abc', width: 800, height: 600, lastFolder: '/a' },
      { id: 'xyz', width: 1200, height: 800, lastFolder: '/b' },
    ]
    const result = setWindowFolder(existing, 'abc', '/new', defaultBounds)
    expect(result[1]).toEqual(existing[1])
  })
})

describe('setWindowPaneLayout', () => {
  it('persists pane layout on a brand-new window', () => {
    const result = setWindowPaneLayout(
      [],
      'abc',
      [{ id: 'pane1', tabs: ['/a.lex'], activeTab: '/a.lex' }],
      [{ id: 'row1', paneIds: ['pane1'] }],
      'pane1',
      defaultBounds
    )
    expect(result).toHaveLength(1)
    expect(result[0].paneLayout).toHaveLength(1)
    expect(result[0].activePaneId).toBe('pane1')
  })

  it('overwrites prior pane layout but preserves lastFolder', () => {
    const existing: WindowState[] = [
      {
        id: 'abc',
        width: 800,
        height: 600,
        lastFolder: '/docs',
        paneLayout: [{ id: 'old', tabs: [] }],
        paneRows: [],
        activePaneId: 'old',
      },
    ]
    const result = setWindowPaneLayout(
      existing,
      'abc',
      [{ id: 'new', tabs: ['/a.lex'], activeTab: '/a.lex' }],
      [{ id: 'row1', paneIds: ['new'] }],
      'new',
      defaultBounds
    )
    expect(result[0].lastFolder).toBe('/docs')
    expect(result[0].paneLayout?.[0].id).toBe('new')
    expect(result[0].activePaneId).toBe('new')
  })
})

describe('appendFilesToWindowPaneLayout', () => {
  const baseState = (): WindowState => ({
    id: 'abc',
    width: 1200,
    height: 800,
    lastFolder: '/docs',
  })

  it('returns the state unchanged when given no files', () => {
    const state = baseState()
    expect(appendFilesToWindowPaneLayout(state, [])).toBe(state)
  })

  it('creates a fresh pane + row when state has no paneLayout', () => {
    const result = appendFilesToWindowPaneLayout(baseState(), ['/docs/a.lex', '/docs/b.lex'])
    expect(result.paneLayout).toHaveLength(1)
    expect(result.paneLayout?.[0].tabs).toEqual(['/docs/a.lex', '/docs/b.lex'])
    expect(result.paneLayout?.[0].activeTab).toBe('/docs/b.lex')
    expect(result.paneRows).toHaveLength(1)
    expect(result.paneRows?.[0].paneIds).toEqual([result.paneLayout![0].id])
    expect(result.activePaneId).toBe(result.paneLayout![0].id)
    expect(result.lastFolder).toBe('/docs')
  })

  it('dedupes duplicate paths within a single seed for a fresh layout', () => {
    const result = appendFilesToWindowPaneLayout(baseState(), [
      '/docs/a.lex',
      '/docs/a.lex',
      '/docs/b.lex',
    ])
    expect(result.paneLayout?.[0].tabs).toEqual(['/docs/a.lex', '/docs/b.lex'])
    expect(result.paneLayout?.[0].activeTab).toBe('/docs/b.lex')
  })

  it('appends to the active pane and updates activeTab', () => {
    const state: WindowState = {
      ...baseState(),
      paneLayout: [
        { id: 'p1', tabs: ['/docs/old.lex'], activeTab: '/docs/old.lex' },
        { id: 'p2', tabs: [], activeTab: null },
      ],
      paneRows: [{ id: 'r1', paneIds: ['p1', 'p2'] }],
      activePaneId: 'p1',
    }
    const result = appendFilesToWindowPaneLayout(state, ['/docs/new.lex'])
    expect(result.paneLayout?.[0].tabs).toEqual(['/docs/old.lex', '/docs/new.lex'])
    expect(result.paneLayout?.[0].activeTab).toBe('/docs/new.lex')
    expect(result.paneLayout?.[1]).toEqual({ id: 'p2', tabs: [], activeTab: null })
    expect(result.activePaneId).toBe('p1')
  })

  it('falls back to the first pane when activePaneId is missing or stale', () => {
    const state: WindowState = {
      ...baseState(),
      paneLayout: [{ id: 'p1', tabs: ['/docs/old.lex'], activeTab: '/docs/old.lex' }],
      paneRows: [{ id: 'r1', paneIds: ['p1'] }],
      activePaneId: 'gone',
    }
    const result = appendFilesToWindowPaneLayout(state, ['/docs/new.lex'])
    expect(result.paneLayout?.[0].tabs).toEqual(['/docs/old.lex', '/docs/new.lex'])
    expect(result.activePaneId).toBe('p1')
  })

  it('deduplicates already-present tabs but still updates activeTab', () => {
    const state: WindowState = {
      ...baseState(),
      paneLayout: [{ id: 'p1', tabs: ['/docs/a.lex', '/docs/b.lex'], activeTab: '/docs/a.lex' }],
      paneRows: [{ id: 'r1', paneIds: ['p1'] }],
      activePaneId: 'p1',
    }
    const result = appendFilesToWindowPaneLayout(state, ['/docs/b.lex'])
    expect(result.paneLayout?.[0].tabs).toEqual(['/docs/a.lex', '/docs/b.lex'])
    expect(result.paneLayout?.[0].activeTab).toBe('/docs/b.lex')
  })

  it('is idempotent under repeated seeding of the same files', () => {
    const start: WindowState = baseState()
    const once = appendFilesToWindowPaneLayout(start, ['/docs/a.lex', '/docs/b.lex'])
    const twice = appendFilesToWindowPaneLayout(once, ['/docs/a.lex', '/docs/b.lex'])
    expect(twice.paneLayout?.[0].tabs).toEqual(['/docs/a.lex', '/docs/b.lex'])
    expect(twice.paneLayout?.[0].activeTab).toBe('/docs/b.lex')
    expect(twice.paneLayout?.[0].id).toBe(once.paneLayout?.[0].id)
  })

  it('inserts a row covering the target pane when none exists', () => {
    const state: WindowState = {
      ...baseState(),
      paneLayout: [{ id: 'p1', tabs: [], activeTab: null }],
      paneRows: [],
      activePaneId: 'p1',
    }
    const result = appendFilesToWindowPaneLayout(state, ['/docs/a.lex'])
    expect(result.paneRows).toHaveLength(1)
    expect(result.paneRows?.[0].paneIds).toContain('p1')
  })

  it('does not duplicate row coverage when a row already includes the target pane', () => {
    const state: WindowState = {
      ...baseState(),
      paneLayout: [{ id: 'p1', tabs: [], activeTab: null }],
      paneRows: [{ id: 'r1', paneIds: ['p1'] }],
      activePaneId: 'p1',
    }
    const result = appendFilesToWindowPaneLayout(state, ['/docs/a.lex'])
    expect(result.paneRows).toHaveLength(1)
    expect(result.paneRows?.[0].id).toBe('r1')
  })

  it('preserves untouched fields like lastFolder and bounds', () => {
    const state: WindowState = {
      id: 'abc',
      x: 100,
      y: 200,
      width: 1024,
      height: 768,
      isMaximized: true,
      lastFolder: '/projects/x',
    }
    const result = appendFilesToWindowPaneLayout(state, ['/projects/x/a.lex'])
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
    expect(result.width).toBe(1024)
    expect(result.height).toBe(768)
    expect(result.isMaximized).toBe(true)
    expect(result.lastFolder).toBe('/projects/x')
  })
})

describe('dedupePreservingOrder', () => {
  it('returns an empty array unchanged', () => {
    expect(dedupePreservingOrder([])).toEqual([])
  })

  it('preserves first occurrence and drops later duplicates', () => {
    expect(dedupePreservingOrder(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
  })

  it('returns an array with all unique items unchanged', () => {
    expect(dedupePreservingOrder(['x', 'y', 'z'])).toEqual(['x', 'y', 'z'])
  })
})
