import type { WebContents } from 'electron'
import {
  isSpoolRequesterTransportErrorCode,
  type SpoolRequesterSubscriptionArgs,
  type SpoolRequesterSubscriptionEvent,
  type SpoolRequesterSubscriptionStartResult,
  type SpoolRequesterSubscriptionStopResult,
  type SpoolRequesterTransportErrorCode
} from '../../shared/spool/spool-ipc-contract'

const SPOOL_REQUESTER_SUBSCRIPTION_EVENT_CHANNEL = 'spoolSharing:subscriptionEvent'

export type SpoolSharingIpcSubscription = {
  close(): void
}

export type SpoolSharingIpcSubscriptionSink = {
  next(value: unknown): void
  error(error: Error): void
  complete(): void
}

export type SpoolRequesterSubscriptionController = {
  subscribeRequester(
    args: SpoolRequesterSubscriptionArgs,
    sink: SpoolSharingIpcSubscriptionSink
  ): SpoolSharingIpcSubscription
}

type RequesterSubscriptionOwner = {
  sender: WebContents
  subscriptionIds: Set<string>
  destroyedListener: () => void
}

type RetainedRequesterSubscription = {
  owner: RequesterSubscriptionOwner
  close(): void
}

/** Owns renderer stream lifetimes without exposing requester sockets to preload. */
export class SpoolRequesterIpcSubscriptions {
  private readonly subscriptions = new Map<string, RetainedRequesterSubscription>()
  private readonly owners = new Map<number, RequesterSubscriptionOwner>()

  constructor(private readonly controller: SpoolRequesterSubscriptionController) {}

  start(
    sender: WebContents,
    args: SpoolRequesterSubscriptionArgs
  ): SpoolRequesterSubscriptionStartResult {
    const subscriptionId = args.subscriptionId
    if (this.subscriptions.has(subscriptionId)) {
      throw new Error('resource_busy')
    }
    const owner = this.getOwner(sender)
    if (owner.subscriptionIds.has(subscriptionId)) {
      throw new Error('resource_busy')
    }
    let downstream: SpoolSharingIpcSubscription | null = null
    let synchronousFailure: SpoolRequesterTransportErrorCode | null = null
    const retained: RetainedRequesterSubscription = {
      owner,
      close: () => downstream?.close()
    }
    this.subscriptions.set(subscriptionId, retained)
    owner.subscriptionIds.add(subscriptionId)
    try {
      downstream = this.controller.subscribeRequester(args, {
        next: (value) => {
          if (this.subscriptions.get(subscriptionId) === retained) {
            this.send(retained, { subscriptionId, type: 'next', value })
          }
        },
        error: (error) => {
          synchronousFailure = projectSpoolRequesterTransportError(error)
          if (this.subscriptions.get(subscriptionId) === retained) {
            this.send(retained, {
              subscriptionId,
              type: 'error',
              code: synchronousFailure
            })
            this.release(subscriptionId)
          }
        },
        complete: () => {
          if (this.subscriptions.get(subscriptionId) === retained) {
            this.send(retained, { subscriptionId, type: 'complete' })
            this.release(subscriptionId)
          }
        }
      })
    } catch (error) {
      this.release(subscriptionId)
      throw spoolRequesterTransportError(error)
    }
    if (this.subscriptions.get(subscriptionId) !== retained) {
      downstream.close()
      throw new Error(synchronousFailure ?? 'resource_unavailable')
    }
    return { subscriptionId }
  }

  stop(senderId: number, subscriptionId: string): SpoolRequesterSubscriptionStopResult {
    const retained = this.subscriptions.get(subscriptionId)
    return {
      stopped: retained?.owner.sender.id === senderId ? this.release(subscriptionId) : false
    }
  }

  close(): void {
    for (const subscriptionId of this.subscriptions.keys()) {
      this.release(subscriptionId)
    }
    for (const owner of this.owners.values()) {
      if (!owner.sender.isDestroyed()) {
        owner.sender.removeListener('destroyed', owner.destroyedListener)
      }
    }
    this.owners.clear()
  }

  private release(subscriptionId: string): boolean {
    const retained = this.subscriptions.get(subscriptionId)
    if (!retained) {
      return false
    }
    this.subscriptions.delete(subscriptionId)
    retained.owner.subscriptionIds.delete(subscriptionId)
    retained.close()
    this.releaseOwnerIfIdle(retained.owner)
    return true
  }

  private releaseOwnerIfIdle(owner: RequesterSubscriptionOwner): void {
    if (owner.subscriptionIds.size > 0) {
      return
    }
    this.owners.delete(owner.sender.id)
    if (!owner.sender.isDestroyed()) {
      owner.sender.removeListener('destroyed', owner.destroyedListener)
    }
  }

  private closeOwnerSubscriptions(ownerWebContentsId: number): void {
    const owner = this.owners.get(ownerWebContentsId)
    if (!owner) {
      return
    }
    for (const subscriptionId of owner.subscriptionIds) {
      this.release(subscriptionId)
    }
    this.owners.delete(ownerWebContentsId)
  }

  private getOwner(sender: WebContents): RequesterSubscriptionOwner {
    const existing = this.owners.get(sender.id)
    if (existing) {
      return existing
    }
    const owner: RequesterSubscriptionOwner = {
      sender,
      subscriptionIds: new Set(),
      destroyedListener: () => this.closeOwnerSubscriptions(sender.id)
    }
    this.owners.set(sender.id, owner)
    sender.once('destroyed', owner.destroyedListener)
    return owner
  }

  private send(
    retained: RetainedRequesterSubscription,
    event: SpoolRequesterSubscriptionEvent
  ): void {
    if (!retained.owner.sender.isDestroyed()) {
      retained.owner.sender.send(SPOOL_REQUESTER_SUBSCRIPTION_EVENT_CHANNEL, event)
    }
  }
}

export function spoolRequesterTransportError(error: unknown): Error {
  return new Error(projectSpoolRequesterTransportError(error))
}

function projectSpoolRequesterTransportError(error: unknown): SpoolRequesterTransportErrorCode {
  const candidate = error instanceof Error ? error.message : ''
  return isSpoolRequesterTransportErrorCode(candidate) ? candidate : 'internal_error'
}
