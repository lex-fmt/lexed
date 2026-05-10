/**
 * Wire types + formatting helpers for the `lex/trustRequest` LSP custom
 * request fired by `lexd-lsp` (γ phase, lex-fmt/lex#549).
 *
 * Pure module — no React, no DOM, no LSP dependencies — so it can be
 * unit-tested in isolation. The lexed renderer renders the modal
 * itself; this module only formats the payload.
 */

export interface TrustRequestSource {
  kind: string
  /** Present when `kind === "lex_toml"`. */
  name?: string
  /** Present when `kind === "local_file"`. */
  path?: string
  /** Present when `kind === "cache_only"`. */
  uri?: string
}

export interface TrustRequestParams {
  namespace: string
  command_string: string
  source: TrustRequestSource
  /**
   * Capability set the handler asked for. String-shaped enum:
   * `"pure"` / `"full"` today; future values render verbatim.
   */
  capability: string
  /**
   * Transport. `"subprocess"` in v1; future values (`"wasm"`, `"native"`)
   * render with descriptive labels.
   */
  transport: string
}

export interface TrustResponse {
  /**
   * `"trusted"` to allow the handler to run; anything else (including
   * unknown future values like `"trusted_once"`) is treated as denied
   * by the host.
   */
  decision: string
  reason?: string
}

export function formatPromptHeadline(params: TrustRequestParams): string {
  const transportLabel = describeTransport(params.transport)
  return `Lex extension namespace "${params.namespace}" wants to run a ${transportLabel} handler.`
}

export function describeSource(source: TrustRequestSource): string {
  // Runtime presence checks (instead of type narrowing) so a source
  // with the right `kind` but missing fields renders the kind label
  // instead of "undefined". Forward-compatible: unknown kinds fall
  // through.
  if (source.kind === 'lex_toml' && typeof source.name === 'string') {
    return `lex.toml [labels] entry "${source.name}"`
  }
  if (source.kind === 'local_file' && typeof source.path === 'string') {
    return `local schema directory ${source.path}`
  }
  if (source.kind === 'cache_only' && typeof source.uri === 'string') {
    return `cached fetch from ${source.uri}`
  }
  return source.kind || 'unknown source'
}

export function describeCapability(capability: string): string {
  switch (capability) {
    case 'pure':
      return 'pure (no fs / no net) — declared but not yet sandbox-enforced'
    case 'full':
      return 'full (fs and/or net access)'
    case '':
      return 'unknown'
    default:
      return capability || 'unknown'
  }
}

export function describeTransport(transport: string): string {
  switch (transport) {
    case 'subprocess':
      return 'subprocess'
    case 'native':
      return 'native (in-process)'
    case 'wasm':
      return 'WASM'
    default:
      return transport || 'unknown-transport'
  }
}
