import { describe, expect, it } from 'vite-plus/test'

import { RuntimeCapabilityAdvertisementSchema, RuntimeCapabilityCache } from '../src/capabilities'

const HOST_AUTHORITY_CAPABILITY = 'terminal.host-authority.v1'

describe('runtime capability compatibility contract', () => {
  it('normalizes current and additive future host advertisements', () => {
    expect(
      RuntimeCapabilityAdvertisementSchema.parse({
        runtimeId: 'runtime-current',
        capabilities: [
          HOST_AUTHORITY_CAPABILITY,
          'future.additive-capability.v9',
          HOST_AUTHORITY_CAPABILITY
        ],
        futureStatusField: true
      })
    ).toEqual({
      runtimeId: 'runtime-current',
      capabilities: [HOST_AUTHORITY_CAPABILITY, 'future.additive-capability.v9']
    })
  })

  it('treats a successful old-host status without capabilities as unsupported', () => {
    const advertisement = RuntimeCapabilityAdvertisementSchema.parse({
      runtimeId: 'runtime-old'
    })
    const cache = new RuntimeCapabilityCache()
    const scope = {
      provider: 'paired-runtime' as const,
      hostIdentity: 'server-old',
      runtimeIncarnation: advertisement.runtimeId,
      connectionGeneration: 1
    }

    cache.replace({ ...scope, capabilities: advertisement.capabilities })

    expect(cache.verdict(scope, HOST_AUTHORITY_CAPABILITY)).toBe('unsupported')
  })

  it('isolates capability state by provider, host, runtime incarnation, and connection', () => {
    const cache = new RuntimeCapabilityCache()
    const firstConnection = {
      provider: 'ssh' as const,
      hostIdentity: 'production-shell',
      runtimeIncarnation: 'runtime-a',
      connectionGeneration: 4
    }
    cache.replace({ ...firstConnection, capabilities: [HOST_AUTHORITY_CAPABILITY] })

    expect(cache.verdict(firstConnection, HOST_AUTHORITY_CAPABILITY)).toBe('supported')
    expect(
      cache.verdict(
        { ...firstConnection, hostIdentity: 'staging-shell' },
        HOST_AUTHORITY_CAPABILITY
      )
    ).toBe('unknown')
    expect(
      cache.verdict(
        { ...firstConnection, provider: 'wsl', hostIdentity: 'production-shell' },
        HOST_AUTHORITY_CAPABILITY
      )
    ).toBe('unknown')

    const replacementConnection = {
      ...firstConnection,
      runtimeIncarnation: 'runtime-b',
      connectionGeneration: 5
    }
    expect(cache.verdict(replacementConnection, HOST_AUTHORITY_CAPABILITY)).toBe('unknown')

    cache.replace({ ...replacementConnection, capabilities: [] })

    expect(cache.verdict(firstConnection, HOST_AUTHORITY_CAPABILITY)).toBe('unknown')
    expect(cache.verdict(replacementConnection, HOST_AUTHORITY_CAPABILITY)).toBe('unsupported')
  })

  it('does not let a late snapshot replace a newer connection generation', () => {
    const cache = new RuntimeCapabilityCache()
    const currentScope = {
      provider: 'relay' as const,
      hostIdentity: 'paired-host',
      runtimeIncarnation: 'runtime-new',
      connectionGeneration: 8
    }
    const current = { ...currentScope, capabilities: [HOST_AUTHORITY_CAPABILITY] }
    cache.replace(current)

    expect(
      cache.replace({
        ...current,
        runtimeIncarnation: 'runtime-old',
        connectionGeneration: 7,
        capabilities: []
      })
    ).toBe('stale-generation')
    expect(cache.verdict(currentScope, HOST_AUTHORITY_CAPABILITY)).toBe('supported')
  })

  it('accepts a capability that arrives later within the same runtime connection', () => {
    const cache = new RuntimeCapabilityCache()
    const scope = {
      provider: 'wsl' as const,
      hostIdentity: 'Ubuntu-24.04',
      runtimeIncarnation: 'runtime-delayed',
      connectionGeneration: 6
    }

    cache.replace({ ...scope, capabilities: [] })
    expect(cache.verdict(scope, HOST_AUTHORITY_CAPABILITY)).toBe('unsupported')

    expect(cache.replace({ ...scope, capabilities: [HOST_AUTHORITY_CAPABILITY] })).toBe('applied')
    expect(cache.verdict(scope, HOST_AUTHORITY_CAPABILITY)).toBe('supported')
  })

  it('rejects a different runtime incarnation inside one connection generation', () => {
    const cache = new RuntimeCapabilityCache()
    const accepted = {
      provider: 'ssh' as const,
      hostIdentity: 'build-host',
      runtimeIncarnation: 'runtime-accepted',
      connectionGeneration: 3
    }
    cache.replace({ ...accepted, capabilities: [HOST_AUTHORITY_CAPABILITY] })

    expect(
      cache.replace({
        ...accepted,
        runtimeIncarnation: 'runtime-conflicting',
        capabilities: []
      })
    ).toBe('incarnation-conflict')
    expect(cache.verdict(accepted, HOST_AUTHORITY_CAPABILITY)).toBe('supported')
  })

  it('rebuilds capability state after a host disconnect', () => {
    const cache = new RuntimeCapabilityCache()
    const firstConnection = {
      provider: 'paired-runtime' as const,
      hostIdentity: 'remote-server',
      runtimeIncarnation: 'runtime-before-disconnect',
      connectionGeneration: 2
    }

    expect(cache.verdict(firstConnection, HOST_AUTHORITY_CAPABILITY)).toBe('unknown')
    expect(cache.replace({ ...firstConnection, capabilities: [HOST_AUTHORITY_CAPABILITY] })).toBe(
      'applied'
    )
    expect(cache.replace({ ...firstConnection, capabilities: [HOST_AUTHORITY_CAPABILITY] })).toBe(
      'applied'
    )

    cache.clearHost(firstConnection)

    expect(cache.verdict(firstConnection, HOST_AUTHORITY_CAPABILITY)).toBe('unknown')
    const reconnected = {
      ...firstConnection,
      runtimeIncarnation: 'runtime-after-disconnect',
      connectionGeneration: 3
    }
    cache.replace({ ...reconnected, capabilities: [] })
    expect(cache.verdict(reconnected, HOST_AUTHORITY_CAPABILITY)).toBe('unsupported')
  })
})
