import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcContext } from '../core'

type CloseChannel = (channelRef: string) => void

const lifetimesByRuntime = new WeakMap<OrcaRuntimeService, SpoolHostChannelLifetimes>()

/** Binds owner-side logical channels to the physical paired-runtime socket that introduced them. */
export class SpoolHostChannelLifetimes {
  private readonly channelsByConnection = new Map<string, Set<string>>()

  ensure(context: RpcContext, channelRef: string, closeChannel: CloseChannel): void {
    const connectionId = context.connectionId
    if (!connectionId) {
      return
    }
    let channels = this.channelsByConnection.get(connectionId)
    if (!channels) {
      channels = new Set()
      this.channelsByConnection.set(connectionId, channels)
      context.runtime.registerSubscriptionCleanup(
        this.cleanupId(connectionId),
        () => this.releaseConnection(connectionId, closeChannel),
        connectionId
      )
    }
    channels.add(channelRef)
  }

  release(context: RpcContext, channelRef: string, closeChannel: CloseChannel): void {
    const connectionId = context.connectionId
    if (connectionId) {
      const channels = this.channelsByConnection.get(connectionId)
      channels?.delete(channelRef)
    }
    closeChannel(channelRef)
  }

  private releaseConnection(connectionId: string, closeChannel: CloseChannel): void {
    const channels = this.channelsByConnection.get(connectionId)
    this.channelsByConnection.delete(connectionId)
    if (!channels) {
      return
    }
    // Why: a dropped relay socket cannot send releaseChannel, so its owner-side ledgers
    // and viewport claims must be released from the physical connection cleanup.
    for (const channelRef of channels) {
      try {
        closeChannel(channelRef)
      } catch {
        // One broken logical channel must not retain the rest of this socket's resources.
      }
    }
  }

  private cleanupId(connectionId: string): string {
    return `spool.host.channels:${connectionId}`
  }
}

export function getSpoolHostChannelLifetimes(
  runtime: OrcaRuntimeService
): SpoolHostChannelLifetimes {
  const existing = lifetimesByRuntime.get(runtime)
  if (existing) {
    return existing
  }
  const created = new SpoolHostChannelLifetimes()
  lifetimesByRuntime.set(runtime, created)
  return created
}
