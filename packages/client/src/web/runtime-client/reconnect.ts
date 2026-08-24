import { WebShellServicesChannel } from '../shell-services-channel'
import { WebRuntimeClientProtocol } from './protocol'
import {
  RECONNECT_DELAYS_MS,
  SHARED_CONNECTION_SUBSCRIPTION_METHODS,
  HEARTBEAT_INTERVAL_MS,
  type WebRuntimeConnectionState
} from './state'

export abstract class WebRuntimeClientReconnect extends WebRuntimeClientProtocol {
  protected handleSocketClosed(closedWs: WebSocket): void {
    if (this.ws !== closedWs) {
      return
    }
    this.ws = null
    this.sharedKey = null
    this.preparedRelay = null
    this.closeTerminalMultiplexSubscription(true)
    this.closeOrpcConnection()
    this.closeShellServicesChannel()
    this.legacyOrpcClient = null
    this.orpcClientPromise = null
    this.orpcTransport = 'unknown'
    this.clearConnectTimer()
    this.clearHandshakeTimer()
    this.clearHeartbeatTimer()
    this.rejectAllPending('Runtime host connection interrupted.')
    this.handleInterruptedSubscriptions()
    if (this.intentionallyClosed || this.state === 'auth-failed') {
      this.setState(this.state === 'auth-failed' ? 'auth-failed' : 'disconnected')
      return
    }
    this.setState('disconnected')
    this.scheduleReconnect()
  }

  protected scheduleReconnect(): void {
    if (this.reconnectTimer || this.intentionallyClosed) {
      return
    }
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)]
    this.reconnectAttempt += 1
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.openConnection()
    }, delay)
  }

  protected closeOrpcConnection(): void {
    this.orpcConnection?.channel.close()
    this.orpcConnection = null
  }

  protected closeTerminalMultiplexSubscription(transportClosed: boolean): void {
    const subscription = this.terminalMultiplexSubscription
    this.terminalMultiplexSubscription = null
    if (transportClosed) {
      subscription?.transportClosed()
    } else {
      subscription?.close()
    }
  }

  protected openShellServicesChannel(): void {
    this.closeShellServicesChannel()
    const channel = new WebShellServicesChannel(
      (plaintext) => this.sendEncryptedText(plaintext),
      (bytes) => this.sendEncryptedBinary(bytes),
      () => this.ws?.close()
    )
    this.shellServicesChannel = channel
    if (!channel.connect()) {
      this.closeShellServicesChannel()
      this.ws?.close()
    }
  }

  protected closeShellServicesChannel(): void {
    this.shellServicesChannel?.close()
    this.shellServicesChannel = null
  }

  protected handleAuthorizationFailure(): void {
    this.intentionallyClosed = true
    this.setState('auth-failed')
    this.rejectAllPending('Unauthorized. Pair this web client again.')
    this.notifySubscriptionsError('unauthorized', 'Unauthorized. Pair this web client again.')
    this.ws?.close()
  }

  protected setState(next: WebRuntimeConnectionState): void {
    this.state = next
    if (next === 'connected') {
      this.replayInterruptedSubscriptions()
      this.startHeartbeat()
      for (const waiter of this.waiters.splice(0)) {
        waiter.resolve()
      }
    } else if (next === 'auth-failed') {
      this.rejectAllWaiters(new Error('Unauthorized. Pair this web client again.'))
    }
  }

  protected nextId(): string {
    this.requestCounter += 1
    return `web-rpc-${this.requestCounter}-${Date.now()}`
  }

  protected rejectAllPending(reason: string): void {
    const error = new Error(reason)
    for (const [id, pending] of this.pending) {
      this.pending.delete(id)
      window.clearTimeout(pending.timeout)
      pending.removeAbortListener()
      pending.reject(error)
    }
  }

  protected rejectAllWaiters(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error)
    }
  }

  protected notifySubscriptionsClosed(): void {
    const subscriptions = Array.from(this.subscriptions.values())
    this.subscriptions.clear()
    for (const subscription of subscriptions) {
      subscription.callbacks.onClose?.()
    }
  }

  protected handleInterruptedSubscriptions(): void {
    for (const [id, subscription] of Array.from(this.subscriptions)) {
      if (!SHARED_CONNECTION_SUBSCRIPTION_METHODS.has(subscription.method)) {
        this.subscriptions.delete(id)
        subscription.callbacks.onClose?.()
        continue
      }
      subscription.callbacks.onTransportInterrupted?.()
      if (this.subscriptions.get(subscription.id) === subscription) {
        subscription.needsReplay = true
      }
    }
  }

  protected replayInterruptedSubscriptions(): void {
    for (const subscription of Array.from(this.subscriptions.values())) {
      if (!subscription.needsReplay) {
        continue
      }
      this.subscriptions.delete(subscription.id)
      subscription.id = this.nextId()
      subscription.needsReplay = false
      this.subscriptions.set(subscription.id, subscription)
      if (
        this.sendEncrypted({
          id: subscription.id,
          deviceToken: this.pairing.deviceToken,
          method: subscription.method,
          params: subscription.params
        })
      ) {
        subscription.callbacks.onTransportReplayed?.()
      } else {
        subscription.needsReplay = true
      }
    }
  }

  protected notifySubscriptionsError(code: string, message: string): void {
    const subscriptions = Array.from(this.subscriptions.values())
    this.subscriptions.clear()
    for (const subscription of subscriptions) {
      subscription.callbacks.onError?.({ code, message })
    }
  }

  protected clearTimers(): void {
    this.clearConnectTimer()
    this.clearHandshakeTimer()
    this.clearHeartbeatTimer()
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  protected clearConnectTimer(): void {
    if (this.connectTimer) {
      window.clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
  }

  protected clearHandshakeTimer(): void {
    if (this.handshakeTimer) {
      window.clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
  }

  protected startHeartbeat(): void {
    this.clearHeartbeatTimer()
    const now = Date.now()
    this.lastInboundFrameAt = now
    this.lastHeartbeatTickAt = now
    this.heartbeatProbeSentAt = null
    this.heartbeatTimer = window.setInterval(() => this.runHeartbeatTick(), HEARTBEAT_INTERVAL_MS)
  }
}
