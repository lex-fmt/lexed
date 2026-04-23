/**
 * Expand a dictionary entry to the case variants worth storing.
 *
 * Plain lowercase ("potato") or Title-case ("Potato") fan out to both
 * forms. Anything else (ALL CAPS, camelCase, iPhone, GitHub…) is
 * returned as-is — those casings carry meaning we shouldn't flatten.
 */
export function caseVariants(word: string): string[] {
  const lower = word.toLowerCase()
  const title = lower.charAt(0).toUpperCase() + lower.slice(1)
  if (word === lower || word === title) {
    return lower === title ? [word] : [lower, title]
  }
  return [word]
}
