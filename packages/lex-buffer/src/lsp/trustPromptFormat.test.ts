import { describe, expect, it } from 'vitest'
import {
  describeCapability,
  describeSource,
  describeTransport,
  formatPromptHeadline,
  type TrustRequestParams
} from './trustPromptFormat'

function lexTomlParams(): TrustRequestParams {
  return {
    namespace: 'acme',
    command_string: '/usr/local/bin/acme-handler --serve',
    source: { kind: 'lex_toml', name: 'acme' },
    capability: 'full',
    transport: 'subprocess'
  }
}

describe('describeSource', () => {
  it('labels lex_toml entries', () => {
    expect(describeSource({ kind: 'lex_toml', name: 'acme' })).toMatch(/lex.toml.*"acme"/)
  })

  it('labels local_file paths', () => {
    expect(describeSource({ kind: 'local_file', path: '/tmp/schemas/acme' })).toMatch(
      /local schema directory \/tmp\/schemas\/acme/
    )
  })

  it('labels cache_only with uri', () => {
    expect(describeSource({ kind: 'cache_only', uri: 'github:acme/lex@v1' })).toMatch(
      /cached fetch from github:acme\/lex@v1/
    )
  })

  it('forward-compatible on unknown kinds', () => {
    // Wire spec says new source variants are non-breaking; the
    // editor must not crash on a kind it doesn't recognise.
    expect(describeSource({ kind: 'future_kind' })).toMatch(/future_kind/)
  })

  it('handles a kind with the right discriminant but missing field', () => {
    // Defensive: lex_toml without `name` falls through to the kind
    // label rather than rendering "undefined".
    const out = describeSource({ kind: 'lex_toml' })
    expect(out).not.toMatch(/undefined/)
    expect(out).toMatch(/lex_toml/)
  })
})

describe('describeCapability', () => {
  it('labels pure with sandbox note', () => {
    const label = describeCapability('pure')
    expect(label).toMatch(/pure/)
    expect(label).toMatch(/not yet sandbox-enforced/)
  })

  it('labels full', () => {
    expect(describeCapability('full')).toMatch(/fs and\/or net/)
  })

  it('passes through unknown values verbatim (forward-compat)', () => {
    expect(describeCapability('fs_read')).toBe('fs_read')
  })

  it('handles empty string as unknown', () => {
    expect(describeCapability('')).toBe('unknown')
  })
})

describe('describeTransport', () => {
  it('labels each known transport', () => {
    expect(describeTransport('subprocess')).toBe('subprocess')
    expect(describeTransport('native')).toMatch(/native/)
    expect(describeTransport('wasm')).toBe('WASM')
  })

  it('passes through unknown transports', () => {
    expect(describeTransport('future_transport')).toBe('future_transport')
  })
})

describe('formatPromptHeadline', () => {
  it('mentions namespace and transport', () => {
    const msg = formatPromptHeadline(lexTomlParams())
    expect(msg).toMatch(/"acme"/)
    expect(msg).toMatch(/subprocess handler/)
  })

  it('updates transport label when transport changes', () => {
    const params = lexTomlParams()
    params.transport = 'wasm'
    expect(formatPromptHeadline(params)).toMatch(/WASM handler/)
  })
})
