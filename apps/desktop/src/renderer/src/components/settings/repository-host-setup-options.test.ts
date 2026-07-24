import { describe, expect, it } from 'vite-plus/test'

import type { ExecutionHostRegistryEntry } from '../../../../shared/execution-host-registry'
import { buildSetupHostOptions } from './repository-host-setup-options'

function sshHost(health: ExecutionHostRegistryEntry['health']): ExecutionHostRegistryEntry {
  return {
    id: 'ssh:ssh-1',
    kind: 'ssh',
    label: '',
    detail: 'SSH',
    health
  }
}

describe('buildSetupHostOptions', () => {
  it('allows path actions on connected SSH hosts', () => {
    expect(
      buildSetupHostOptions({ projectHostSetups: [], hostOptions: [sshHost('available')] })[0]
    ).toMatchObject({ isAvailable: true, canUsePathActions: true, detail: 'SSH' })
  })

  it.each(['disconnected', 'connecting', 'error'] as const)(
    'keeps %s SSH hosts available only as placeholders',
    (health) => {
      expect(
        buildSetupHostOptions({ projectHostSetups: [], hostOptions: [sshHost(health)] })[0]
      ).toMatchObject({
        isAvailable: true,
        canUsePathActions: false,
        detail: 'Connect this host before importing or cloning the project'
      })
    }
  )
})
