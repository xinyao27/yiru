import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import { isKeepaliveFrame } from '@yiru/runtime-protocol/rpc-envelope'
import { withRemoteRuntimeTailscaleHint } from '@yiru/runtime-protocol/tailscale-endpoint'
import type { MachineBrowserReady } from '@yiru/runtime-protocol/web-connect'

import { readMachineBrowserReady, verifyMachineBrowserReady } from '../connect/grant-client'
import {
  bytesFromBase64,
  decrypt,
  decryptBytes,
  deriveSharedKey,
  encrypt,
  encryptBytes,
  publicKeyFromBase64
} from '../e2ee'
import { WebRuntimeClientConnection } from './connection'
import {
  abortError,
  isControlType,
  isEndResult,
  isRuntimeFailureResponse,
  websocketPayloadToUint8
} from './protocol-values'
import { REQUEST_TIMEOUT_MS } from './state'

export abstract class WebRuntimeClientProtocol extends WebRuntimeClientConnection {
  protected async handleSocketMessage(rawData: unknown, sourceWs?: WebSocket): Promise<void> {
    const raw = typeof rawData === 'string' ? rawData : null
    if (this.state === 'handshaking') {
      if (raw === null || !this.sharedKey) {
        return
      }
      try {
        const control: unknown = JSON.parse(raw)
        const ready = readMachineBrowserReady(control)
        if (ready) {
          if (!(await this.acceptMachineBrowserReady(ready))) {
            sourceWs?.close()
          }
          return
        }
        if (isControlType(control, 'e2ee_ready')) {
          const deviceToken = this.pairing.relayMachineId
            ? this.relayDeviceToken
            : this.pairing.deviceToken
          if (deviceToken) {
            this.sendEncrypted({ type: 'e2ee_auth', deviceToken })
          }
          return
        }
      } catch {
        // The authenticated control frame is encrypted, so non-JSON is normal here.
      }

      const plaintext = decrypt(raw, this.sharedKey)
      if (plaintext === null) {
        return
      }
      try {
        const control = JSON.parse(plaintext) as {
          type?: unknown
          error?: { code?: string; message?: string }
          runtimeId?: unknown
          capabilities?: unknown
        }
        if (control.type === 'e2ee_authenticated') {
          if (typeof control.runtimeId === 'string' && control.runtimeId.length > 0) {
            this.publishRuntimeId(control.runtimeId)
          }
          if (Array.isArray(control.capabilities)) {
            for (const capability of control.capabilities) {
              if (typeof capability === 'string') {
                this.authenticatedCapabilities.add(capability)
              }
            }
          }
          this.clearHandshakeTimer()
          this.reconnectAttempt = 0
          if (this.options.enableShellServices !== false) {
            this.openShellServicesChannel()
          }
          this.setState('connected')
        } else if (control.type === 'e2ee_error' || control.error?.code === 'unauthorized') {
          this.handleAuthorizationFailure()
        }
      } catch {
        // Ignore malformed handshake payloads; the server will close on timeout.
      }
      return
    }

    if (this.state !== 'connected' || !this.sharedKey) {
      return
    }

    if (raw === null) {
      const encrypted = await websocketPayloadToUint8(rawData)
      if (sourceWs && this.ws !== sourceWs) {
        return
      }
      if (!encrypted) {
        return
      }
      const plaintext = decryptBytes(encrypted, this.sharedKey)
      if (!plaintext) {
        return
      }
      if (this.terminalMultiplexSubscription) {
        if (!this.terminalMultiplexSubscription.receiveBinary(plaintext)) {
          sourceWs?.close()
        }
        return
      }
      if (this.shellServicesChannel?.receiveBinary(plaintext)) {
        return
      }
      if (this.orpcConnection?.channel.receiveBinary(plaintext)) {
        return
      }
      for (const subscription of this.subscriptions.values()) {
        subscription.callbacks.onBinary?.(plaintext)
      }
      return
    }

    const plaintext = decrypt(raw, this.sharedKey)
    if (plaintext === null) {
      return
    }
    if (this.terminalMultiplexSubscription) {
      if (!this.terminalMultiplexSubscription.receiveText(plaintext)) {
        sourceWs?.close()
      }
      return
    }
    if (this.shellServicesChannel?.receiveText(plaintext)) {
      return
    }
    if (this.orpcConnection?.channel.receiveText(plaintext)) {
      return
    }

    let response: RuntimeRpcResponse<unknown> | Record<string, unknown>
    try {
      response = JSON.parse(plaintext) as RuntimeRpcResponse<unknown> | Record<string, unknown>
    } catch {
      return
    }
    if (isKeepaliveFrame(response)) {
      return
    }
    if (!('id' in response) || typeof response.id !== 'string') {
      return
    }
    if (isRuntimeFailureResponse(response) && response.error.code === 'unauthorized') {
      this.handleAuthorizationFailure()
      return
    }

    const subscription = this.subscriptions.get(response.id)
    if (subscription) {
      const subscriptionResponse = response as RuntimeRpcResponse<unknown>
      // Why: setup failures must be evicted before callbacks so reconnect cannot replay them.
      if (subscriptionResponse.ok === false) {
        this.subscriptions.delete(response.id)
      }
      // Why: subscription-backed unary RPCs can return ordinary success frames.
      subscription.callbacks.onResponse(subscriptionResponse)
      if (subscriptionResponse.ok && isEndResult(subscriptionResponse.result)) {
        this.subscriptions.delete(response.id)
        subscription.callbacks.onClose?.()
      }
      return
    }

    const pending = this.pending.get(response.id)
    if (!pending) {
      return
    }
    this.pending.delete(response.id)
    window.clearTimeout(pending.timeout)
    pending.removeAbortListener()
    this.recordRuntimeId(response as RuntimeRpcResponse<unknown>)
    pending.resolve(response as RuntimeRpcResponse<unknown>)
  }

  protected sendEncrypted(message: unknown): boolean {
    return this.sendEncryptedText(JSON.stringify(message))
  }

  protected async acceptMachineBrowserReady(ready: MachineBrowserReady): Promise<boolean> {
    const relay = this.preparedRelay
    const machineSigningKey = this.pairing.relayMachineSigningKey
    if (
      !relay ||
      !machineSigningKey ||
      ready.machineId !== relay.session.auth.machineId ||
      ready.browserE2eePublicKeyB64 !== relay.session.auth.e2eePublicKeyB64 ||
      ready.runtimePublicKeyB64 !== relay.session.runtimePublicKeyB64 ||
      !(await verifyMachineBrowserReady(ready, machineSigningKey))
    ) {
      return false
    }
    const machineSharedKey = deriveSharedKey(
      relay.secretKey,
      publicKeyFromBase64(ready.machineE2eePublicKeyB64)
    )
    const tokenBytes = decryptBytes(
      bytesFromBase64(ready.encryptedDeviceTokenB64),
      machineSharedKey
    )
    if (!tokenBytes) {
      return false
    }
    this.relayDeviceToken = new TextDecoder().decode(tokenBytes)
    return this.relayDeviceToken.length > 0
  }

  protected sendEncryptedText(plaintext: string): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.sharedKey) {
      return false
    }
    ws.send(encrypt(plaintext, this.sharedKey))
    return true
  }

  protected sendEncryptedBinary(bytes: Uint8Array<ArrayBufferLike>): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.sharedKey) {
      return false
    }
    ws.send(encryptBytes(bytes, this.sharedKey))
    return true
  }

  protected waitForConnected(timeoutMs = REQUEST_TIMEOUT_MS, signal?: AbortSignal): Promise<void> {
    if (this.state === 'connected') {
      return Promise.resolve()
    }
    if (this.state === 'auth-failed') {
      return Promise.reject(new Error('Unauthorized. Pair this web client again.'))
    }
    if (this.intentionallyClosed) {
      return Promise.reject(new Error('Runtime host connection closed.'))
    }
    if (signal?.aborted) {
      return Promise.reject(abortError(signal))
    }
    return new Promise((resolve, reject) => {
      const removeWaiter = (): void => {
        const index = this.waiters.indexOf(waiter)
        if (index !== -1) {
          this.waiters.splice(index, 1)
        }
      }
      const abort = (): void => {
        removeWaiter()
        window.clearTimeout(timeout)
        reject(abortError(signal))
      }
      const timeout = window.setTimeout(() => {
        removeWaiter()
        signal?.removeEventListener('abort', abort)
        reject(
          new Error(
            withRemoteRuntimeTailscaleHint(
              'Timed out while connecting to the runtime host.',
              this.pairing.endpoint
            )
          )
        )
      }, timeoutMs)
      const waiter = {
        resolve: () => {
          window.clearTimeout(timeout)
          signal?.removeEventListener('abort', abort)
          resolve()
        },
        reject: (error: Error) => {
          window.clearTimeout(timeout)
          signal?.removeEventListener('abort', abort)
          reject(error)
        }
      }
      signal?.addEventListener('abort', abort, { once: true })
      this.waiters.push(waiter)
    })
  }
}
