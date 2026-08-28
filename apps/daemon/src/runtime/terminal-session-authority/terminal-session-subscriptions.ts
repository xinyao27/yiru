type SubscriptionCleanup = () => void | Promise<void>

export class TerminalSessionSubscriptions {
  private readonly cleanups = new Map<string, SubscriptionCleanup>()
  private readonly cleanupPromises = new Map<
    string,
    { cleanup: SubscriptionCleanup; promise: Promise<void> }
  >()
  private readonly subscriptionsByConnection = new Map<string, Set<string>>()
  private readonly connectionBySubscription = new Map<string, string>()

  register(subscriptionId: string, cleanup: SubscriptionCleanup, connectionId?: string): void {
    const existing = this.cleanups.get(subscriptionId)
    if (existing) {
      // Why: a stable id is moving to a newer socket; detach the old owner before cleanup awaits.
      this.removeConnectionIndex(subscriptionId)
      this.cleanup(subscriptionId)
    }
    this.cleanups.set(subscriptionId, cleanup)
    if (!connectionId) {
      return
    }
    let subscriptions = this.subscriptionsByConnection.get(connectionId)
    if (!subscriptions) {
      subscriptions = new Set()
      this.subscriptionsByConnection.set(connectionId, subscriptions)
    }
    subscriptions.add(subscriptionId)
    this.connectionBySubscription.set(subscriptionId, connectionId)
  }

  cleanup(subscriptionId: string): void {
    void this.cleanupAndWait(subscriptionId).catch((error) => {
      console.error(`[runtime] subscription cleanup failed for ${subscriptionId}:`, error)
    })
  }

  retryAfter(subscriptionId: string, cleanupOwner: SubscriptionCleanup, gate: Promise<void>): void {
    const failedGeneration = this.cleanupPromises.get(subscriptionId)
    void gate.then(
      async () => {
        await (failedGeneration?.cleanup === cleanupOwner
          ? failedGeneration.promise.catch(() => undefined)
          : undefined)
        while (this.cleanups.get(subscriptionId) === cleanupOwner) {
          const newerGeneration = this.cleanupPromises.get(subscriptionId)
          if (newerGeneration?.cleanup === cleanupOwner) {
            // Why: join a concurrent retry for this exact generation before scheduling another.
            await newerGeneration.promise.catch(() => undefined)
            continue
          }
          this.cleanup(subscriptionId)
          return
        }
      },
      () => undefined
    )
  }

  async cleanupAndWait(subscriptionId: string): Promise<void> {
    const cleanup = this.cleanups.get(subscriptionId)
    if (!cleanup) {
      return
    }
    const inFlight = this.cleanupPromises.get(subscriptionId)
    if (inFlight?.cleanup === cleanup) {
      return inFlight.promise
    }
    let cleanupResult: void | Promise<void>
    try {
      cleanupResult = cleanup()
    } catch (error) {
      cleanupResult = Promise.reject(error)
    }
    const promise = Promise.resolve(cleanupResult)
      .then(() => {
        // Why: an old reconnect generation must never remove the replacement registered mid-await.
        if (this.cleanups.get(subscriptionId) !== cleanup) {
          return
        }
        this.cleanups.delete(subscriptionId)
        this.removeConnectionIndex(subscriptionId)
      })
      .finally(() => {
        if (this.cleanupPromises.get(subscriptionId)?.promise === promise) {
          this.cleanupPromises.delete(subscriptionId)
        }
      })
    this.cleanupPromises.set(subscriptionId, { cleanup, promise })
    return promise
  }

  cleanupByPrefix(prefix: string): void {
    const ids = [...this.cleanups.keys()].filter((id) => id.startsWith(prefix))
    for (const id of ids) {
      this.cleanup(id)
    }
  }

  cleanupConnection(connectionId: string): void {
    const subscriptions = this.subscriptionsByConnection.get(connectionId)
    if (!subscriptions) {
      return
    }
    // Why: cleanup mutates both indexes, so transport-close sweeps a stable snapshot.
    for (const id of Array.from(subscriptions)) {
      if (this.connectionBySubscription.get(id) !== connectionId) {
        subscriptions.delete(id)
        continue
      }
      this.cleanup(id)
    }
    if (subscriptions.size === 0) {
      this.subscriptionsByConnection.delete(connectionId)
    }
  }

  private removeConnectionIndex(subscriptionId: string): void {
    const connectionId = this.connectionBySubscription.get(subscriptionId)
    if (!connectionId) {
      return
    }
    this.connectionBySubscription.delete(subscriptionId)
    const subscriptions = this.subscriptionsByConnection.get(connectionId)
    if (!subscriptions) {
      return
    }
    subscriptions.delete(subscriptionId)
    if (subscriptions.size === 0) {
      this.subscriptionsByConnection.delete(connectionId)
    }
  }
}
