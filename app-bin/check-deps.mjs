#!/usr/bin/env node
/**
 * Preflight gate for the build chain: assert that the artifacts `fetch-deps`
 * is supposed to have downloaded are actually present on disk, and fail fast
 * with an actionable message if any are missing.
 *
 * Why this exists (lexed#144, follow-up from #142): `fetch-deps --if-missing`
 * can report `✓` yet leave `resources/tree-sitter-lex.wasm` and
 * `resources/queries/*.scm` absent (a CRLF bug did exactly that on Windows).
 * The build then started anyway and only blew up deep inside `vite build`
 * with a cryptic `[UNRESOLVED_IMPORT] ... '../resources/tree-sitter-lex.wasm?url'`,
 * which points at the *import site*, not the *cause* — and #142 was misdiagnosed
 * as a code-signing problem for it. This is defense-in-depth: don't trust
 * fetch-deps' `✓`; verify the files are on disk before `tsc`/`vite build`.
 *
 * The required-artifact list is DERIVED from `deps.json` (the source of truth
 * for what fetch-deps populates) plus the embedded-grammars manifest, so it
 * stays in sync with the deps the build actually imports
 * (`src/treesitter.ts`, `src/embedded.ts`) without a hand-maintained copy.
 *
 * Exit 0 = all present. Exit 1 = something missing (build aborts).
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

/**
 * Derive the set of files fetch-deps is expected to produce, relative to ROOT.
 * Pure function of the two manifests so it is unit-testable without touching
 * the filesystem.
 *
 * @param {object} deps         parsed deps.json
 * @param {object} grammars     parsed resources/embedded-grammars.json
 * @returns {string[]} repo-relative paths that must exist after fetch-deps
 */
export function requiredArtifacts(deps, grammars) {
  const required = new Set()

  // Repo-relative paths are always POSIX (forward slashes): they are matched
  // against the `/`-joined strings the tests assert and printed in the abort
  // message, and `existsSync` accepts forward slashes on every platform. Using
  // bare `path.join` would emit backslashes on Windows — the exact OS this
  // preflight most needs to be correct on (#142 was a Windows fetch bug).
  const join = (...segs) => path.posix.join(...segs)

  // The lexd-lsp binary carries a `.exe` suffix on Windows (see
  // package.json win.extraResources + electron/lsp-manager.ts), so the file
  // on disk — and thus what we must assert — is platform-specific.
  const exeSuffix = process.platform === 'win32' ? '.exe' : ''

  // tree-sitter: `extract` maps an archive entry -> a destination directory.
  // A bare-filename source lands as `<dest>/<basename>`; a directory source
  // (e.g. `queries`) lands as `<dest>` itself. We assert the destination the
  // build imports actually exists.
  const ts = deps['tree-sitter']
  if (ts?.extract) {
    for (const [src, dest] of Object.entries(ts.extract)) {
      const base = path.posix.basename(src)
      // If src is a plain file (has an extension), it lands at dest/base.
      // If it's a directory (no extension, e.g. "queries"), dest IS the dir.
      required.add(path.posix.extname(base) ? join(dest, base) : dest)
    }
  }

  // The three query files the renderer build statically imports
  // (src/treesitter.ts) — these are what was actually missing in #142.
  // They live under the tree-sitter `queries` extract destination.
  const queriesDest = ts?.extract?.queries ?? 'resources/queries'
  for (const q of ['highlights.scm', 'injections.scm']) {
    required.add(join(queriesDest, q))
  }

  // lexd-lsp binary (deps.json `dest` + `binary`), platform-suffixed.
  const lsp = deps['lexd-lsp']
  if (lsp?.dest && lsp?.binary) {
    required.add(join(lsp.dest, lsp.binary + exeSuffix))
  }

  // embedded-grammars: one parser.wasm + highlights.scm per grammar in the
  // manifest. src/embedded.ts globs `resources/embedded-grammars/*/{parser.wasm,highlights.scm}`.
  for (const g of grammars?.grammars ?? []) {
    const dir = join('resources/embedded-grammars', g.name)
    required.add(join(dir, 'parser.wasm'))
    required.add(join(dir, 'highlights.scm'))
  }

  return [...required]
}

/**
 * @param {string[]} required  repo-relative paths
 * @param {(p: string) => boolean} exists  filesystem probe (injectable for tests)
 * @returns {string[]} the subset that is missing
 */
export function findMissing(required, exists) {
  return required.filter((rel) => !exists(rel))
}

/**
 * Compute the missing-artifact list for a build tree, treating an
 * absent/unreadable manifest as a missing required artifact rather than a
 * crash — the manifests (deps.json, resources/embedded-grammars.json) are
 * themselves fetched/extracted, so a missing one is exactly the failure this
 * preflight exists to catch.
 *
 * Pure: all I/O is injected, so this is unit-testable without a filesystem.
 *
 * @param {(rel: string) => (object|null)} readManifest  parse a repo-relative
 *   JSON manifest, or return null if it is missing/unreadable.
 * @param {(rel: string) => boolean} exists  repo-relative existence probe.
 * @returns {string[]} repo-relative paths that are missing.
 */
export function computeMissing(readManifest, exists) {
  const missing = []

  const deps = readManifest('deps.json')
  if (deps === null) missing.push('deps.json')

  const grammars = readManifest('resources/embedded-grammars.json')
  if (grammars === null) missing.push('resources/embedded-grammars.json')

  // Derive from whatever manifests we *did* read; a null one contributes no
  // entries (its absence is already reported above).
  const required = requiredArtifacts(deps ?? {}, grammars ?? {})
  missing.push(...findMissing(required, exists))

  // De-dupe (a manifest can appear both as itself-missing and as a derived
  // required artifact, e.g. embedded-grammars.json via the tree-sitter extract).
  return [...new Set(missing)]
}

function main() {
  const readManifest = (rel) => {
    try {
      return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'))
    } catch {
      return null
    }
  }
  const exists = (rel) => existsSync(path.join(ROOT, rel))

  const missing = computeMissing(readManifest, exists)

  if (missing.length > 0) {
    const list = missing.map((m) => `    - ${m}`).join('\n')
    console.error(
      `✗ build aborted: expected resources missing after fetch-deps:\n${list}\n` +
        `  (fetch-deps reported success but did not populate them — check fetch-deps / deps.json)`
    )
    process.exit(1)
  }
}

// Only run when invoked as a script, not when imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
