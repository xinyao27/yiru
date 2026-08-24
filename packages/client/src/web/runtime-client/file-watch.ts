import { LEGACY_RUNTIME_STREAM_METHODS } from '../legacy-orpc-link'
import {
  createFileWatchReplayOverflowResponse,
  getFileWatchSubscriptionId,
  isFileWatchStartingResponse
} from './protocol-values'
import type { SubscriptionCallbacks, WebRuntimeSubscriptionHandle } from './state'
import { WebRuntimeClientSubscriptions } from './subscriptions'

export abstract class WebRuntimeClientFileWatch extends WebRuntimeClientSubscriptions {
  protected async subscribeSharedFileWatch(
    params: unknown,
    callbacks: SubscriptionCallbacks,
    options?: { timeoutMs?: number }
  ): Promise<WebRuntimeSubscriptionHandle> {
    const teardownKey = JSON.stringify(params) ?? String(params)
    await Promise.all(
      Array.from(this.fileWatchTeardownRetries.get(teardownKey) ?? [], (retry) => retry())
    )
    let stopped = false
    let remoteSubscriptionId: string | null = null
    let transportInterrupted = false
    let pendingReplayResync = false
    let unwatchStarted = false
    let handle: WebRuntimeSubscriptionHandle | null = null
    const dropLocalSubscription = (): void => {
      handle?.unsubscribe()
    }
    let unwatchAttempt: Promise<void> | null = null
    const retryRemoteUnwatch = (): Promise<void> => {
      if (unwatchAttempt) {
        return unwatchAttempt
      }
      unwatchStarted = true
      const attempt = this.call(
        LEGACY_RUNTIME_STREAM_METHODS.filesUnwatch,
        { subscriptionId: remoteSubscriptionId! },
        { timeoutMs: 5_000 }
      )
        .then((response) => {
          if (response.ok === false) {
            throw new Error(`${response.error.code}: ${response.error.message}`)
          }
          const retries = this.fileWatchTeardownRetries.get(teardownKey)
          retries?.delete(retryRemoteUnwatch)
          if (retries?.size === 0) {
            this.fileWatchTeardownRetries.delete(teardownKey)
          }
          dropLocalSubscription()
        })
        .catch((error: unknown) => {
          console.warn('Failed to unwatch remote file subscription:', error)
          throw error
        })
        .finally(() => {
          unwatchAttempt = null
          unwatchStarted = false
        })
      unwatchAttempt = attempt
      return attempt
    }
    const unwatchAndDropLocalSubscription = (): void => {
      if (unwatchStarted) {
        return
      }
      if (!remoteSubscriptionId) {
        dropLocalSubscription()
        return
      }
      // Why: retain the shared-socket callback and retry ownership until the
      // server acknowledges physical teardown; a new watch joins this barrier.
      const retries = this.fileWatchTeardownRetries.get(teardownKey) ?? new Set()
      retries.add(retryRemoteUnwatch)
      this.fileWatchTeardownRetries.set(teardownKey, retries)
      void retryRemoteUnwatch().catch(() => {})
    }
    const wrappedCallbacks: SubscriptionCallbacks = {
      ...callbacks,
      onResponse: (response) => {
        transportInterrupted = false
        const nextSubscriptionId = getFileWatchSubscriptionId(response)
        if (nextSubscriptionId) {
          remoteSubscriptionId = nextSubscriptionId
          if (stopped) {
            unwatchAndDropLocalSubscription()
            return
          }
        }
        // Why: the server publishes cancellation ownership before native setup;
        // callers should still become ready only after the watcher is live.
        if (isFileWatchStartingResponse(response)) {
          return
        }
        if (!stopped) {
          callbacks.onResponse(response)
          if (pendingReplayResync && nextSubscriptionId && response.ok) {
            pendingReplayResync = false
            // Why: a replayed watch reports changes only from its own native
            // setup; the reconnect gap produced no events, so consumers must
            // conservatively re-scan once the replacement is ready.
            callbacks.onResponse(createFileWatchReplayOverflowResponse(response, params))
          }
        } else if (response.ok === false) {
          dropLocalSubscription()
        }
      },
      onError: (error) => {
        if (!stopped) {
          callbacks.onError?.(error)
        }
      },
      onClose: () => {
        if (!stopped) {
          callbacks.onClose?.()
        }
      },
      onTransportInterrupted: () => {
        transportInterrupted = true
        remoteSubscriptionId = null
        if (!stopped) {
          return
        }
        const retries = this.fileWatchTeardownRetries.get(teardownKey)
        retries?.delete(retryRemoteUnwatch)
        if (retries?.size === 0) {
          this.fileWatchTeardownRetries.delete(teardownKey)
        }
        // Why: socket close physically releases the old server subscription;
        // a locally stopped watch must not be replayed on the replacement.
        dropLocalSubscription()
      },
      onTransportReplayed: () => {
        transportInterrupted = false
        pendingReplayResync = true
      }
    }
    handle = await this.subscribeOnCurrentConnection(
      LEGACY_RUNTIME_STREAM_METHODS.filesWatch,
      params,
      wrappedCallbacks,
      options
    )

    return {
      unsubscribe: () => {
        if (stopped) {
          return
        }
        stopped = true
        if (remoteSubscriptionId) {
          unwatchAndDropLocalSubscription()
        } else if (transportInterrupted) {
          // Why: socket close already released the old server subscription;
          // remove its replay record instead of reviving a locally stopped watch.
          dropLocalSubscription()
        }
        // Why: an older server may not publish its id until ready. Retain the
        // callback so a late response can still physically unwatch the root.
      },
      sendBinary: (bytes) => handle?.sendBinary(bytes)
    }
  }
}
