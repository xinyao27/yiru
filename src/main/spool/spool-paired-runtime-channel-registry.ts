import { randomUUID } from 'node:crypto'
import type { PairedRuntimeTerminalSubscription } from './spool-paired-runtime-terminal-subscription'

export type PairedRuntimeChannel = {
  channelRef: string
  instanceIds: Set<string>
}

/** Tracks downstream resources by the originating Spool connection. */
export class SpoolPairedRuntimeChannelRegistry {
  private readonly channels = new Map<string, Map<string, PairedRuntimeChannel>>()
  private readonly subscriptions = new Map<string, Set<PairedRuntimeTerminalSubscription>>()

  channel(connectionId: string, environmentId: string): PairedRuntimeChannel {
    let byEnvironment = this.channels.get(connectionId)
    if (!byEnvironment) {
      byEnvironment = new Map()
      this.channels.set(connectionId, byEnvironment)
    }
    const existing = byEnvironment.get(environmentId)
    if (existing) {
      return existing
    }
    const created = { channelRef: randomUUID(), instanceIds: new Set<string>() }
    byEnvironment.set(environmentId, created)
    return created
  }

  rememberSubscription(
    connectionId: string,
    subscription: PairedRuntimeTerminalSubscription
  ): void {
    let subscriptions = this.subscriptions.get(connectionId)
    if (!subscriptions) {
      subscriptions = new Set()
      this.subscriptions.set(connectionId, subscriptions)
    }
    subscriptions.add(subscription)
  }

  forgetSubscription(connectionId: string, subscription: PairedRuntimeTerminalSubscription): void {
    const subscriptions = this.subscriptions.get(connectionId)
    subscriptions?.delete(subscription)
    if (subscriptions?.size === 0) {
      this.subscriptions.delete(connectionId)
    }
  }

  subscriptionsFor(connectionId: string): ReadonlySet<PairedRuntimeTerminalSubscription> {
    return this.subscriptions.get(connectionId) ?? new Set()
  }

  channelsFor(connectionId: string): ReadonlyMap<string, PairedRuntimeChannel> {
    return this.channels.get(connectionId) ?? new Map()
  }

  takeSubscriptions(connectionId: string): ReadonlySet<PairedRuntimeTerminalSubscription> {
    const subscriptions = this.subscriptionsFor(connectionId)
    this.subscriptions.delete(connectionId)
    return subscriptions
  }

  takeChannels(connectionId: string): ReadonlyMap<string, PairedRuntimeChannel> {
    const channels = this.channelsFor(connectionId)
    this.channels.delete(connectionId)
    return channels
  }
}
