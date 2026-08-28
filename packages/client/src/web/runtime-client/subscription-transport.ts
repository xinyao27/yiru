import { RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY } from '@yiru/runtime-protocol/workbench/runtime-orpc-socket'

import {
  openWebTerminalMultiplexSubscription,
  type WebTerminalMultiplexSubscription
} from '../terminal-multiplex-subscription'
import { WebRuntimeClientFileWatch } from './file-watch'
import type {
  SubscriptionCallbacks,
  RuntimeSubscription,
  WebRuntimeSubscriptionHandle,
  SubscribeOptions
} from './state'

export abstract class WebRuntimeClientSubscriptionTransport extends WebRuntimeClientFileWatch {
  async subscribeOnCurrentConnection(
    method: string,
    params: unknown,
    callbacks: SubscriptionCallbacks,
    options?: SubscribeOptions
  ): Promise<WebRuntimeSubscriptionHandle> {
    await this.waitForConnected(options?.timeoutMs)
    if (method === 'terminal.multiplex') {
      return this.subscribeTerminalMultiplexOnCurrentConnection(params, callbacks)
    }
    const id = this.nextId()
    const subscription: RuntimeSubscription = { id, method, params, callbacks, needsReplay: false }
    this.subscriptions.set(id, subscription)
    if (!this.sendEncrypted({ id, deviceToken: this.pairing.deviceToken, method, params })) {
      this.subscriptions.delete(id)
      throw new Error('Runtime host is not connected.')
    }
    return {
      unsubscribe: () => {
        this.subscriptions.delete(subscription.id)
        // Tell the server to reap its keyed cleanup.
        // before the socket goes away. Best-effort: a closed socket already reaps.
        const teardown = options?.buildUnsubscribe?.(params)
        if (teardown) {
          this.sendEncrypted({
            id: this.nextId(),
            deviceToken: this.pairing.deviceToken,
            method: teardown.method,
            params: teardown.params
          })
        }
      },
      sendBinary: (bytes) => {
        this.sendEncryptedBinary(bytes)
      }
    }
  }

  protected async subscribeTerminalMultiplexOnCurrentConnection(
    params: unknown,
    callbacks: SubscriptionCallbacks
  ): Promise<WebRuntimeSubscriptionHandle> {
    if (!this.authenticatedCapabilities.has(RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY)) {
      throw new Error('Runtime host does not support inbound terminal multiplex frames.')
    }
    const runtimeId = this.authenticatedRuntimeId
    if (!runtimeId) {
      throw new Error('Runtime host did not identify the terminal multiplex connection.')
    }
    const requestId = this.nextId()
    let subscription: WebTerminalMultiplexSubscription
    try {
      subscription = await openWebTerminalMultiplexSubscription({
        requestId,
        params,
        runtimeId,
        callbacks,
        sendText: (frame) => this.sendEncryptedText(frame),
        sendBinary: (frame) => this.sendEncryptedBinary(frame),
        onCreated: (created) => {
          this.terminalMultiplexSubscription = created
        }
      })
    } catch (error) {
      this.closeTerminalMultiplexSubscription(false)
      throw error
    }
    return {
      unsubscribe: () => {
        if (this.terminalMultiplexSubscription === subscription) {
          this.closeTerminalMultiplexSubscription(false)
        }
      },
      sendBinary: (bytes) => subscription.sendBinary(bytes)
    }
  }
}
