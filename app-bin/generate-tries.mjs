#!/usr/bin/env node
/**
 * Compile Hunspell .aff/.dic pairs into cspell-trie-lib .trie.gz files,
 * with the shared tech-vocab supplement merged into every language.
 *
 * Output: `dictionaries/<lang>.trie.gz` — what the renderer loads at
 * runtime. Runtime uses cspell-trie-lib's `importTrie` + `Trie` (has /
 * suggest); no affix parsing or morphology expansion happens at runtime,
 * so startup cost is 50–320ms instead of the 50s–minutes nspell takes on
 * large locales.
 *
 * Cache: `dictionaries/.tries.stamp` stores a hash of every input
 * (cspell-tools version, supplement.txt, each .aff/.dic). A run whose
 * stamp matches is a no-op. `--force` regenerates anyway; `--check`
 * exits non-zero if stale (CI mode, no network / no compile).
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DICT_DIR = path.join(ROOT, 'dictionaries')
const SOURCE_DIR = path.join(DICT_DIR, 'source')
const STAMP = path.join(DICT_DIR, '.tries.stamp')
const SUPPLEMENT = path.join(SOURCE_DIR, 'supplement.txt')

// Kept in sync with app-bin/generate-dictionary-supplement.py's
// SUPPORTED_LANGUAGES. A language listed here MUST have a matching
// .aff/.dic pair under dictionaries/source/.
const LANGUAGES = [
  'de_DE',
  'en_GB',
  'en_US',
  'es_ES',
  'fr_FR',
  'it_IT',
  'nl_NL',
  'pl_PL',
  'pt_BR',
  'ru_RU',
]

// cspell-tools' exact version hashes into the stamp so a package bump
// invalidates the cache and forces recompilation.
function cspellToolsVersion() {
  const pkg = JSON.parse(
    readFileSync(path.join(ROOT, 'node_modules/@cspell/cspell-tools/package.json'), 'utf-8')
  )
  return pkg.version
}

function computeStamp() {
  const h = createHash('sha256')
  h.update(`cspell-tools@${cspellToolsVersion()}\n`)
  h.update(`languages:${LANGUAGES.join(',')}\n`)
  h.update('supplement:')
  h.update(readFileSync(SUPPLEMENT))
  h.update('\n')
  for (const lang of LANGUAGES) {
    h.update(`${lang}.aff:`)
    h.update(readFileSync(path.join(SOURCE_DIR, `${lang}.aff`)))
    h.update('\n')
    h.update(`${lang}.dic:`)
    h.update(readFileSync(path.join(SOURCE_DIR, `${lang}.dic`)))
    h.update('\n')
  }
  return h.digest('hex')
}

function readStamp() {
  if (!existsSync(STAMP)) return null
  return readFileSync(STAMP, 'utf-8').trim()
}

function allOutputsExist() {
  return LANGUAGES.every((l) => existsSync(path.join(DICT_DIR, `${l}.trie.gz`)))
}

function compileLang(lang) {
  const dic = path.join(SOURCE_DIR, `${lang}.dic`)
  const res = spawnSync(
    'npx',
    ['cspell-tools', 'compile-trie', dic, SUPPLEMENT, '-M', lang, '-o', DICT_DIR],
    { stdio: ['ignore', 'inherit', 'inherit'], cwd: ROOT }
  )
  if (res.status !== 0) {
    throw new Error(`cspell-tools compile-trie failed for ${lang} (exit ${res.status})`)
  }
}

function main() {
  const args = new Set(process.argv.slice(2))
  const force = args.has('--force')
  const check = args.has('--check')

  const expected = computeStamp()
  const actual = readStamp()

  if (check) {
    if (actual === expected && allOutputsExist()) {
      console.log('tries are up to date')
      process.exit(0)
    }
    console.error('tries are stale — run `npm run tries:update`')
    process.exit(1)
  }

  if (!force && actual === expected && allOutputsExist()) {
    console.log(`tries are up to date (stamp ${expected.slice(0, 12)})`)
    return
  }

  console.error(`Compiling ${LANGUAGES.length} language tries…`)
  for (const lang of LANGUAGES) {
    const t0 = Date.now()
    console.error(`  compile ${lang}…`)
    compileLang(lang)
    console.error(`  done ${lang} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  }

  writeFileSync(STAMP, expected + '\n')
  console.error(`Wrote ${LANGUAGES.length} tries to dictionaries/ (stamp ${expected.slice(0, 12)})`)
}

main()
