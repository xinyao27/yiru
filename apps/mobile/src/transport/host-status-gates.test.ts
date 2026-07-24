import { MIN_COMPATIBLE_RUNTIME_SERVER_VERSION } from '@yiru/runtime-protocol/capabilities'
import { describe, expect, it } from 'vite-plus/test'

import { deriveHostStatusGates } from './host-status-gates'

describe('floating workspace host status gates', () => {
  it('uses Yiru runtime protocol fields and exposes an enabled host', () => {
    expect(
      deriveHostStatusGates({
        runtimeProtocolVersion: MIN_COMPATIBLE_RUNTIME_SERVER_VERSION,
        minCompatibleRuntimeClientVersion: 0,
        capabilities: ['terminal.quick-commands.v1'],
        floatingWorkspaceEnabled: true
      })
    ).toEqual({
      hostCapabilities: ['terminal.quick-commands.v1'],
      floatingWorkspaceEnabled: true,
      compatVerdict: { kind: 'ok' }
    })
  })

  it('falls back to legacy Mobile protocol aliases for mixed-version hosts', () => {
    expect(
      deriveHostStatusGates({
        protocolVersion: MIN_COMPATIBLE_RUNTIME_SERVER_VERSION,
        minCompatibleMobileVersion: 0,
        floatingWorkspaceEnabled: true
      }).compatVerdict
    ).toEqual({ kind: 'ok' })
  })

  it('fails closed when the feature flag is absent', () => {
    expect(
      deriveHostStatusGates({
        runtimeProtocolVersion: MIN_COMPATIBLE_RUNTIME_SERVER_VERSION,
        minCompatibleRuntimeClientVersion: 0
      }).floatingWorkspaceEnabled
    ).toBe(false)
  })
})
