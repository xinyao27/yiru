import { WebRuntimeClientRequests } from './requests'
import {
  SHARED_CONNECTION_SUBSCRIPTION_METHODS,
  type SubscriptionCallbacks,
  type WebRuntimeSubscriptionHandle,
  type SubscribeOptions
} from './state'

export abstract class WebRuntimeClientSubscriptions extends WebRuntimeClientRequests {
  async subscribe(
    method: string,
    params: unknown,
    callbacks: SubscriptionCallbacks,
    options?: SubscribeOptions
  ): Promise<WebRuntimeSubscriptionHandle> {
    if (SHARED_CONNECTION_SUBSCRIPTION_METHODS.has(method)) {
      // Why: file watches are text-only and already have an explicit
      // files.unwatch RPC, so sharing the main socket avoids exhausting the
      // server's WebSocket connection cap in large browser sessions.
      return this.subscribeSharedFileWatch(params, callbacks, options)
    }
    const client = this.createChildClient({
      enableShellServices: method === 'terminal.multiplex' ? false : undefined
    })
    this.childClients.add(client)
    const closeChild = (notifySubscriptions = false): void => {
      this.childClients.delete(client)
      client.close({ notifySubscriptions })
    }
    try {
      const wrappedCallbacks: SubscriptionCallbacks = {
        ...callbacks,
        onError: (error) => {
          callbacks.onError?.(error)
          closeChild()
        },
        onClose: () => {
          callbacks.onClose?.()
          closeChild()
        }
      }
      const handle = await client.subscribeOnCurrentConnection(
        method,
        params,
        wrappedCallbacks,
        options
      )
      return {
        unsubscribe: () => {
          // Why: emit the explicit teardown RPC for server-owned subscriptions
          // on the child socket BEFORE closing it, so the server reaps the
          // fs-watcher on view-toggle instead of leaking it until socket close.
          handle.unsubscribe()
          closeChild()
        },
        sendBinary: (bytes) => handle.sendBinary(bytes)
      }
    } catch (error) {
      closeChild()
      throw error
    }
  }
}
