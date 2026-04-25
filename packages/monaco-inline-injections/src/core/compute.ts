import { CATEGORY_COLORS } from './constants'
import { mapTokensToDecorations } from './mapTokens'
import { resolveLanguageId } from './resolve'
import type {
  DecorationCategory,
  InjectionHostAdapter,
  InjectionRange,
  InjectionZone,
} from './types'

/**
 * Orchestrator: given a parsed set of injection zones and a host adapter,
 * returns the aggregated `InjectionRange`s per `DecorationCategory`.
 *
 * Behaviour contract:
 *   - The registered-languages set is fetched once per call via the adapter.
 *     Hosts are expected to cache this themselves across calls.
 *   - Zones whose language does not resolve to a registered ID are skipped.
 *   - Zones whose `getSemanticTokens` call returns `null` are skipped.
 *   - Zones whose `getSemanticTokens` throws are skipped — errors never
 *     bubble out of this function.
 *
 * The returned map always contains an entry for every `DecorationCategory`
 * (empty array when no tokens matched) so callers can iterate and apply the
 * correct clear-plus-set sequence against their native decoration API.
 */
export async function computeInjectionDecorations(
  zones: InjectionZone[],
  host: InjectionHostAdapter
): Promise<Map<DecorationCategory, InjectionRange[]>> {
  const rangesByCategory = new Map<DecorationCategory, InjectionRange[]>()
  for (const category of Object.keys(CATEGORY_COLORS) as DecorationCategory[]) {
    rangesByCategory.set(category, [])
  }

  if (zones.length === 0) return rangesByCategory

  const registered = await host.getRegisteredLanguages()

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]
    const langId = resolveLanguageId(zone.language, registered)
    if (!langId) continue

    let tokens
    try {
      tokens = await host.getSemanticTokens(i, zone.text, langId)
    } catch {
      continue
    }
    if (!tokens) continue

    mapTokensToDecorations(tokens, zone, rangesByCategory)
  }

  return rangesByCategory
}
