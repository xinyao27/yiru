import { withRemoteRuntimeTailscaleHint } from '@yiru/runtime-protocol/tailscale-endpoint'

import { createBrowserRelaySession } from '../connect/grant-client'
import { deriveSharedKey, generateKeyPair, publicKeyFromBase64, publicKeyToBase64 } from '../e2ee'
import { CONNECT_TIMEOUT_MS, HANDSHAKE_TIMEOUT_MS, type PreparedRelayConnection } from './state'
import { WebRuntimeClientSubscriptionTransport } from './subscription-transport'

export abstract class WebRuntimeClientConnection extends WebRuntimeClientSubscriptionTransport {
  close(options: { notifySubscriptions?: boolean } = {}): void {
    const shouldNotifySubscriptions = options.notifySubscriptions ?? true
    this.intentionallyClosed = true
    for (const child of Array.from(this.childClients)) {
      child.close({ notifySubscriptions: shouldNotifySubscriptions })
    }
    this.childClients.clear()
    this.fileWatchTeardownRetries.clear()
    this.clearTimers()
    this.closeTerminalMultiplexSubscription(false)
    this.closeOrpcConnection()
    this.closeShellServicesChannel()
    this.rejectAllPending('Runtime host connection closed.')
    this.rejectAllWaiters(new Error('Runtime host connection closed.'))
    if (shouldNotifySubscriptions) {
      this.notifySubscriptionsClosed()
    } else {
      this.subscriptions.clear()
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.sharedKey = null
    this.preparedRelay = null
    this.setState('disconnected')
  }

  protected openConnection(): void {
    if (this.intentionallyClosed) {
      return
    }
    const relayMachineId = this.pairing.relayMachineId
    if (relayMachineId) {
      this.setState('connecting')
      const keyPair = generateKeyPair()
      void createBrowserRelaySession(relayMachineId, publicKeyToBase64(keyPair.publicKey)).then(
        (session) => this.openSocket(session.socketUrl, { session, secretKey: keyPair.secretKey }),
        () => this.scheduleReconnect()
      )
      return
    }
    this.openSocket(this.pairing.endpoint, null)
  }

  protected openSocket(endpoint: string, relay: PreparedRelayConnection | null): void {
    if (this.intentionallyClosed) {
      return
    }
    let ws: WebSocket
    try {
      ws = new WebSocket(endpoint)
    } catch (error) {
      this.rejectAllPending(error instanceof Error ? error.message : String(error))
      this.scheduleReconnect()
      return
    }

    ws.binaryType = 'arraybuffer'
    this.ws = ws
    this.sharedKey = null
    this.relayDeviceToken = null
    this.preparedRelay = relay
    this.authenticatedRuntimeId = null
    this.authenticatedCapabilities.clear()
    this.setState('connecting')

    this.connectTimer = window.setTimeout(() => {
      if (this.ws === ws && ws.readyState === WebSocket.CONNECTING) {
        ws.close()
        this.handleSocketClosed(ws)
      }
    }, CONNECT_TIMEOUT_MS)

    ws.onopen = () => {
      if (this.ws !== ws) {
        return
      }
      this.clearConnectTimer()
      this.setState('handshaking')
      if (relay) {
        this.sharedKey = deriveSharedKey(
          relay.secretKey,
          publicKeyFromBase64(relay.session.runtimePublicKeyB64)
        )
        ws.send(JSON.stringify(relay.session.auth))
      } else {
        const keyPair = generateKeyPair()
        if (!this.serverPublicKey) {
          ws.close()
          return
        }
        this.sharedKey = deriveSharedKey(keyPair.secretKey, this.serverPublicKey)
        ws.send(
          JSON.stringify({
            type: 'e2ee_hello',
            publicKeyB64: publicKeyToBase64(keyPair.publicKey)
          })
        )
      }
      this.handshakeTimer = window.setTimeout(() => {
        if (this.ws === ws && this.state === 'handshaking') {
          ws.close()
        }
      }, HANDSHAKE_TIMEOUT_MS)
    }

    ws.onmessage = (event) => {
      // Why: stale socket callbacks can arrive after reconnect swaps this.ws;
      // they must not drive auth or subscription state on the replacement.
      if (this.ws !== ws) {
        return
      }
      // Why: any inbound frame (RPC reply, subscription push, keepalive, probe
      // echo) proves the socket is alive — reset the liveness watchdog and clear
      // any outstanding probe.
      this.lastInboundFrameAt = Date.now()
      this.heartbeatProbeSentAt = null
      void this.handleSocketMessage(event.data, ws)
    }

    ws.onclose = () => this.handleSocketClosed(ws)
    ws.onerror = () => {
      if (this.state === 'connecting') {
        this.rejectAllWaiters(
          new Error(
            withRemoteRuntimeTailscaleHint(
              'Could not connect to the runtime host.',
              this.pairing.endpoint
            )
          )
        )
      }
    }
  }
}
