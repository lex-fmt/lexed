import { describe, it, expect } from 'vitest'
import {
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
