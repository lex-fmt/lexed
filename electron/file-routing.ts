import path from 'node:path'

export interface OpenWindowState {
  windowId: number
  root: string | null | undefined
  lastFocusedAt?: number
  isFocused?: boolean
}

export interface RecentRoot {
  path: string
  lastUsedAt: number
}

export type OpenFileRoute =
  | { kind: 'existingWindow'; windowId: number; filePath: string }
  | { kind: 'newWindowWithRoot'; root: string; filePath: string }
  | { kind: 'newWindow'; filePath: string }

export interface RouteOpenFileParams {
  filePath: string
  openWindows: OpenWindowState[]
  recentRoots: RecentRoot[]
  platform?: typeof process.platform
}

export function isCaseSensitiveFs(platform: typeof process.platform): boolean {
  return platform === 'linux' || platform === 'freebsd' || platform === 'openbsd'
}

function normalizeForCompare(p: string, caseSensitive: boolean): string {
  const resolved = path.resolve(p)
  return caseSensitive ? resolved : resolved.toLowerCase()
}

/**
 * Is `filePath` inside `root` (or equal to it)?
 *
 * Uses platform-appropriate case sensitivity unless overridden.
 */
export function isPathInsideRoot(
  filePath: string,
  root: string,
  platform: typeof process.platform = process.platform
): boolean {
  if (!filePath || !root) return false
  const caseSensitive = isCaseSensitiveFs(platform)
  const a = normalizeForCompare(filePath, caseSensitive)
  const b = normalizeForCompare(root, caseSensitive)
  if (a === b) return true
  const bWithSep = b.endsWith(path.sep) ? b : b + path.sep
  return a.startsWith(bWithSep)
}

/**
 * Pick the most specific (longest) root from `candidates` that contains `filePath`.
 * Ties broken by `tiebreak` (higher score wins). Returns null if none match.
 */
export function findBestRoot<T>(
  filePath: string,
  candidates: T[],
  getRoot: (c: T) => string | null | undefined,
  tiebreak: (c: T) => number,
  platform: typeof process.platform = process.platform
): T | null {
  let best: T | null = null
  let bestLen = -1
  let bestScore = -Infinity
  for (const c of candidates) {
    const root = getRoot(c)
    if (!root) continue
    if (!isPathInsideRoot(filePath, root, platform)) continue
    const len = root.length
    const score = tiebreak(c)
    if (len > bestLen || (len === bestLen && score > bestScore)) {
      best = c
      bestLen = len
      bestScore = score
    }
  }
  return best
}

/**
 * Decide where to route a file the OS wants us to open.
 *
 * Strategy:
 *   1. If any open window's root contains the file → open it there (best = longest root,
 *      ties broken by recency / focus).
 *   2. Else if any recent (closed) root contains the file → open a new window with that root.
 *   3. Else if at least one window is open → open the file in the focused window (or the
 *      most-recently-focused one, or the first one).
 *   4. Else → create a new window with no specific root for the file.
 */
export function routeOpenFile(params: RouteOpenFileParams): OpenFileRoute {
  const { filePath, openWindows, recentRoots, platform = process.platform } = params

  const bestOpen = findBestRoot(
    filePath,
    openWindows,
    (w) => w.root,
    (w) => (w.isFocused ? Number.MAX_SAFE_INTEGER : (w.lastFocusedAt ?? 0)),
    platform
  )
  if (bestOpen) {
    return { kind: 'existingWindow', windowId: bestOpen.windowId, filePath }
  }

  const bestRecent = findBestRoot(
    filePath,
    recentRoots,
    (r) => r.path,
    (r) => r.lastUsedAt,
    platform
  )
  if (bestRecent) {
    return { kind: 'newWindowWithRoot', root: bestRecent.path, filePath }
  }

  if (openWindows.length > 0) {
    const fallback = pickFallbackWindow(openWindows)
    if (fallback) {
      return { kind: 'existingWindow', windowId: fallback.windowId, filePath }
    }
  }

  return { kind: 'newWindow', filePath }
}

function pickFallbackWindow(openWindows: OpenWindowState[]): OpenWindowState | null {
  if (openWindows.length === 0) return null
  const focused = openWindows.find((w) => w.isFocused)
  if (focused) return focused
  let best: OpenWindowState | null = null
  let bestAt = -Infinity
  for (const w of openWindows) {
    const at = w.lastFocusedAt ?? 0
    if (at > bestAt) {
      best = w
      bestAt = at
    }
  }
  return best ?? openWindows[0]
}

/**
 * Merge a new root into the recent-roots list. Deduplicates by path
 * (case-sensitivity-aware) and returns a list sorted by lastUsedAt descending,
 * capped at `max`.
 */
export function updateRecentRoots(
  existing: RecentRoot[],
  newRoot: string,
  now: number,
  max: number = 20,
  platform: typeof process.platform = process.platform
): RecentRoot[] {
  if (!newRoot) return existing
  const caseSensitive = isCaseSensitiveFs(platform)
  const resolved = path.resolve(newRoot)
  const key = caseSensitive ? resolved : resolved.toLowerCase()
  const filtered = existing.filter((r) => {
    const resolvedExisting = path.resolve(r.path)
    const existingKey = caseSensitive ? resolvedExisting : resolvedExisting.toLowerCase()
    return existingKey !== key
  })
  filtered.unshift({ path: resolved, lastUsedAt: now })
  filtered.sort((a, b) => b.lastUsedAt - a.lastUsedAt)
  return filtered.slice(0, max)
}
