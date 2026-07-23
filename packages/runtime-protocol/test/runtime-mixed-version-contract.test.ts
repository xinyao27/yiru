import { describe, expect, it } from 'vite-plus/test'

import {
  evaluateRuntimeCompat,
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  MIN_COMPATIBLE_RUNTIME_SERVER_VERSION,
  RUNTIME_PROTOCOL_VERSION,
  RuntimeCapabilityAdvertisementSchema,
  RuntimeCapabilityCache,
  TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY
} from '../src/capabilities'

describe('runtime mixed-version contract', () => {
  it('allows current clients and hosts to connect', () => {
    expect(
      evaluateRuntimeCompat({
        clientProtocolVersion: RUNTIME_PROTOCOL_VERSION,
        minCompatibleServerProtocolVersion: MIN_COMPATIBLE_RUNTIME_SERVER_VERSION,
        serverProtocolVersion: RUNTIME_PROTOCOL_VERSION,
        serverMinCompatibleClientProtocolVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
      })
    ).toEqual({
      kind: 'ok',
      clientProtocolVersion: RUNTIME_PROTOCOL_VERSION,
      serverProtocolVersion: RUNTIME_PROTOCOL_VERSION
    })
  })

  it('blocks an old client when the host raises its minimum', () => {
    expect(
      evaluateRuntimeCompat({
        clientProtocolVersion: 1,
        minCompatibleServerProtocolVersion: 1,
        serverProtocolVersion: 3,
        serverMinCompatibleClientProtocolVersion: 2
      })
    ).toEqual({
      kind: 'blocked',
      reason: 'client-too-old',
      clientProtocolVersion: 1,
      serverProtocolVersion: 3,
      requiredClientProtocolVersion: 2
    })
  })

  it('blocks a new client from calling a host below its minimum', () => {
    expect(
      evaluateRuntimeCompat({
        clientProtocolVersion: 3,
        minCompatibleServerProtocolVersion: 2,
        serverProtocolVersion: 1,
        serverMinCompatibleClientProtocolVersion: 1
      })
    ).toEqual({
      kind: 'blocked',
      reason: 'server-too-old',
      clientProtocolVersion: 3,
      serverProtocolVersion: 1,
      requiredServerProtocolVersion: 2
    })
  })

  it('keeps an old compatible client connected to a new host with additive capabilities', () => {
    const advertisement = RuntimeCapabilityAdvertisementSchema.parse({
      runtimeId: 'runtime-new',
      capabilities: [TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY, 'future.capability.v2']
    })

    expect(
      evaluateRuntimeCompat({
        clientProtocolVersion: 2,
        minCompatibleServerProtocolVersion: 2,
        serverProtocolVersion: 3,
        serverMinCompatibleClientProtocolVersion: 2
      })
    ).toMatchObject({ kind: 'ok' })
    expect(advertisement.capabilities).toContain(TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY)
  })

  it('lets a new client safely degrade against an old compatible host', () => {
    const advertisement = RuntimeCapabilityAdvertisementSchema.parse({
      runtimeId: 'runtime-old'
    })
    const cache = new RuntimeCapabilityCache()
    const scope = {
      provider: 'paired-runtime' as const,
      hostIdentity: 'old-host',
      runtimeIncarnation: advertisement.runtimeId,
      connectionGeneration: 1
    }

    expect(
      evaluateRuntimeCompat({
        clientProtocolVersion: 3,
        minCompatibleServerProtocolVersion: 2,
        serverProtocolVersion: 2,
        serverMinCompatibleClientProtocolVersion: 2
      })
    ).toMatchObject({ kind: 'ok' })
    cache.replace({ ...scope, capabilities: advertisement.capabilities })
    expect(cache.verdict(scope, TERMINAL_HOST_AUTHORITY_RUNTIME_CAPABILITY)).toBe('unsupported')
  })
})
