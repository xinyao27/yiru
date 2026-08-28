import type { RuntimeHost, RuntimeHostCapability } from '@yiru/runtime-protocol/contract'
import {
  parseExecutionHostId,
  toSshExecutionHostId,
  toWslExecutionHostId,
  type ExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'

import type { WorkspaceEventLog } from '../events/log'
import { hostCapabilityCache } from './capabilities'
import type { Host } from './contract'
import { createLocalHost } from './local'
import { createSshHost } from './ssh'
import type { HostStore } from './store'
import { createWslHost } from './wsl'

const HOST_CONFIG_SCOPE = 'host-config'

export class HostRegistry {
  private readonly capabilities = hostCapabilityCache
  private readonly events: WorkspaceEventLog
  private readonly local = createLocalHost()
  private readonly store: HostStore

  constructor(store: HostStore, events: WorkspaceEventLog) {
    this.store = store
    this.events = events
  }

  list(): RuntimeHost[] {
    return [this.descriptor(this.local), ...this.store.list()]
  }

  get(id: ExecutionHostId | null | undefined): Host {
    if (!id || id === 'local') {
      return this.local
    }
    const parsed = parseExecutionHostId(id)
    if (!parsed || parsed.kind === 'local' || parsed.kind === 'runtime') {
      throw new Error('host_not_found')
    }
    const stored = this.store.get(id)
    return stored.kind === 'ssh'
      ? createSshHost(stored.label, stored.target ?? '')
      : createWslHost(stored.label, stored.target ?? '')
  }

  add(input: {
    expectedRevision: number
    kind: 'ssh' | 'wsl'
    label: string
    target: string
  }): Promise<{ host: RuntimeHost; revision: number }> {
    return this.events.runAtRevision(HOST_CONFIG_SCOPE, input.expectedRevision, () => {
      const id =
        input.kind === 'ssh'
          ? toSshExecutionHostId(input.target)
          : toWslExecutionHostId(input.target)
      const adapter =
        input.kind === 'ssh'
          ? createSshHost(input.label, input.target)
          : createWslHost(input.label, input.target)
      const host = this.store.put({ ...this.descriptor(adapter), id })
      this.capabilities.invalidate(host.id)
      const event = this.events.append(HOST_CONFIG_SCOPE, 'host.added', {
        hostId: host.id,
        kind: host.kind,
        label: host.label
      })
      return { host, revision: event.revision }
    })
  }

  async probe(hostId: ExecutionHostId): Promise<{
    capabilities: RuntimeHostCapability[]
    host: RuntimeHost
  }> {
    const host = this.get(hostId)
    return { capabilities: await this.capabilities.probe(host), host: this.descriptor(host) }
  }

  homeDirectory(hostId: ExecutionHostId): Promise<string | null> {
    return this.capabilities.homeDirectory(this.get(hostId))
  }

  isWslAvailable(): boolean {
    return this.capabilities.isWslAvailable()
  }

  listWslDistros(): string[] {
    return this.capabilities.listWslDistros()
  }

  async remove(
    hostId: ExecutionHostId,
    expectedRevision: number,
    assertUnused: () => void
  ): Promise<{ removed: true; revision: number }> {
    if (hostId === 'local') {
      throw new Error('host_remove_local_forbidden')
    }
    return this.events.runAtRevision(HOST_CONFIG_SCOPE, expectedRevision, () => {
      assertUnused()
      this.store.remove(hostId)
      this.capabilities.invalidate(hostId)
      const event = this.events.append(HOST_CONFIG_SCOPE, 'host.removed', { hostId })
      return { removed: true, revision: event.revision }
    })
  }

  revision(): number {
    return this.events.revision(HOST_CONFIG_SCOPE)
  }

  private descriptor(host: Host): RuntimeHost {
    return {
      id: host.id,
      kind: host.kind,
      label: host.label,
      platform: host.platform,
      target: host.target
    }
  }
}
