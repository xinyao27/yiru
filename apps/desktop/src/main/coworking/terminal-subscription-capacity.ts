import { COWORKING_MAX_TERMINAL_SUBSCRIPTIONS_PER_CONNECTION_WORKTREE } from '~shared/coworking/resource-limits'

import { CoworkingExecutionError } from './execution-error'

export type CoworkingHostSubscription = {
  close(): void
}

export class CoworkingTerminalSubscriptionCapacity {
  private readonly subscriptionsByConnection = new Map<
    string,
    Map<CoworkingHostSubscription, string>
  >()

  reserve(connectionId: string, instanceId: string, subscription: CoworkingHostSubscription): void {
    let subscriptions = this.subscriptionsByConnection.get(connectionId)
    if (!subscriptions) {
      subscriptions = new Map()
      this.subscriptionsByConnection.set(connectionId, subscriptions)
    }
    let worktreeSubscriptionCount = 0
    for (const subscriptionInstanceId of subscriptions.values()) {
      if (subscriptionInstanceId === instanceId) {
        worktreeSubscriptionCount++
      }
    }
    if (worktreeSubscriptionCount >= COWORKING_MAX_TERMINAL_SUBSCRIPTIONS_PER_CONNECTION_WORKTREE) {
      throw new CoworkingExecutionError('resource_busy')
    }
    subscriptions.set(subscription, instanceId)
  }

  release(connectionId: string, subscription: CoworkingHostSubscription): void {
    const subscriptions = this.subscriptionsByConnection.get(connectionId)
    subscriptions?.delete(subscription)
    if (subscriptions?.size === 0) {
      this.subscriptionsByConnection.delete(connectionId)
    }
  }

  closeConnection(connectionId: string): void {
    const subscriptions = this.subscriptionsByConnection.get(connectionId)
    this.subscriptionsByConnection.delete(connectionId)
    for (const subscription of subscriptions?.keys() ?? []) {
      try {
        subscription.close()
      } catch {
        // The connection has already lost authority; continue releasing siblings.
      }
    }
  }

  closeWorktree(connectionId: string, instanceId: string): void {
    const subscriptions = this.subscriptionsByConnection.get(connectionId)
    for (const [subscription, subscriptionInstanceId] of subscriptions ?? []) {
      if (subscriptionInstanceId !== instanceId) {
        continue
      }
      try {
        subscription.close()
      } catch {
        // Revocation has already removed authority; continue releasing sibling streams.
      }
    }
  }
}
