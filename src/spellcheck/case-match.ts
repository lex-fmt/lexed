/**
 * Case-aware dictionary lookup.
 *
 * The cspell-trie dictionaries store words with their canonical casing
 * — `and`, `the`, `HTML`, `JWT` — and `Trie.has()` is strict. Hunspell
 * (the engine nspell used to run) was lenient: it auto-folded common
 * patterns on lookup so sentence-initial `And` and shouted `AND` both
 * matched `and` in the dictionary. This replicates that behavior.
 *
 * Rules:
 *   1. Try the word as-is.
 *   2. If it starts with an uppercase letter, also try its lowercase
 *      form (`And` → `and`, `By` → `by`).
 *   3. If the whole word is uppercase, also try its Title-case form
 *      (`AND` → `And`) — covers shouted text that's otherwise valid.
 *
 * Mixed casings like `iPhone`, `macOS`, `GitHub` only match strictly —
 * those specific spellings carry meaning and shouldn't be forgiven.
 */
export function matchWithCase(lookup: (word: string) => boolean, word: string): boolean {
  if (lookup(word)) return true

  if (!/^\p{Lu}/u.test(word)) return false

  const lower = word.toLowerCase()
  if (lower !== word && lookup(lower)) return true

  if (word === word.toUpperCase()) {
    const title = lower.charAt(0).toUpperCase() + lower.slice(1)
    if (title !== word && lookup(title)) return true
  }

  return false
}
