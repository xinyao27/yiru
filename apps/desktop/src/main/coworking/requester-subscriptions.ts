import {
  isCoworkingRequesterTransportErrorCode,
  type CoworkingRequesterSubscriptionArgs,
  type CoworkingRequesterSubscriptionEvent,
  type CoworkingRequesterTransportErrorCode
} from '~shared/coworking/ipc-contract'

export type CoworkingSharingSubscription = {
  close(): void
}

export type CoworkingSharingSubscriptionSink = {
  next(value: unknown): void
  error(error: Error): void
  complete(): void
}

export type CoworkingRequesterSubscriptionController = {
  subscribeRequester(
    args: CoworkingRequesterSubscriptionArgs,
    sink: CoworkingSharingSubscriptionSink
  ): CoworkingSharingSubscription
}

type RetainedRequesterSubscription = {
  connectionId: string
  close(): void
  onEnd(): void
}

export class CoworkingRequesterSubscriptions {
  private readonly subscriptions = new Map<string, RetainedRequesterSubscription>()

  constructor(private readonly controller: CoworkingRequesterSubscriptionController) {}

  start(
    connectionId: string,
    args: CoworkingRequesterSubscriptionArgs,
    emit: (event: CoworkingRequesterSubscriptionEvent) => void,
    onEnd: () => void
  ): void {
    const subscriptionId = args.subscriptionId
    if (this.subscriptions.has(subscriptionId)) {
      throw new Error('resource_busy')
    }
    let downstream: CoworkingSharingSubscription | null = null
    let synchronousFailure: CoworkingRequesterTransportErrorCode | null = null
    const retained: RetainedRequesterSubscription = {
      connectionId,
      close: () => downstream?.close(),
      onEnd
    }
    this.subscriptions.set(subscriptionId, retained)
    try {
      downstream = this.controller.subscribeRequester(args, {
        next: (value) => {
          if (this.subscriptions.get(subscriptionId) === retained) {
            emit({ subscriptionId, type: 'next', value })
          }
        },
        error: (error) => {
          synchronousFailure = projectCoworkingRequesterTransportError(error)
          if (this.subscriptions.get(subscriptionId) === retained) {
            emit({ subscriptionId, type: 'error', code: synchronousFailure })
            this.release(subscriptionId)
          }
        },
        complete: () => {
          if (this.subscriptions.get(subscriptionId) === retained) {
            emit({ subscriptionId, type: 'complete' })
            this.release(subscriptionId)
          }
        }
      })
    } catch (error) {
      this.release(subscriptionId)
      throw coworkingRequesterTransportError(error)
    }
    if (this.subscriptions.get(subscriptionId) !== retained) {
      downstream.close()
      throw new Error(synchronousFailure ?? 'resource_unavailable')
    }
  }

  stop(connectionId: string, subscriptionId: string): boolean {
    const retained = this.subscriptions.get(subscriptionId)
    return retained?.connectionId === connectionId ? this.release(subscriptionId) : false
  }

  closeConnection(connectionId: string): void {
    for (const [subscriptionId, retained] of this.subscriptions) {
      if (retained.connectionId === connectionId) {
        this.release(subscriptionId)
      }
    }
  }

  close(): void {
    for (const subscriptionId of this.subscriptions.keys()) {
      this.release(subscriptionId)
    }
  }

  private release(subscriptionId: string): boolean {
    const retained = this.subscriptions.get(subscriptionId)
    if (!retained) {
      return false
    }
    this.subscriptions.delete(subscriptionId)
    retained.close()
    retained.onEnd()
    return true
  }
}

export function coworkingRequesterTransportError(error: unknown): Error {
  return new Error(projectCoworkingRequesterTransportError(error))
}

function projectCoworkingRequesterTransportError(
  error: unknown
): CoworkingRequesterTransportErrorCode {
  const candidate = error instanceof Error ? error.message : ''
  return isCoworkingRequesterTransportErrorCode(candidate) ? candidate : 'internal_error'
}
