import { RUNTIME_ORPC_RUNTIME_CAPABILITY } from '@yiru/runtime-protocol/protocol-version'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'

import {
  createLegacyRuntimeHeartbeatRequest,
  createLegacyRuntimeOrpcClient
} from '../legacy-orpc-link'
import { createWebRuntimeOrpcConnection, type WebRuntimeOrpcClient } from '../orpc-channel'
import { WebRuntimeClientReconnect } from './reconnect'
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_IDLE_MS, HEARTBEAT_PROBE_GRACE_MS } from './state'

export abstract class WebRuntimeClientHeartbeat extends WebRuntimeClientReconnect {
  protected clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.heartbeatProbeSentAt = null
  }

  protected runHeartbeatTick(): void {
    const now = Date.now()
    // Why: if this tick lands far later than scheduled, the loop was suspended
    // (backgrounded/frozen tab) — that gap is NOT evidence the socket died, so
    // re-baseline the liveness clocks and drop any stale probe before judging.
    const sinceLastTick = now - this.lastHeartbeatTickAt
    this.lastHeartbeatTickAt = now
    if (sinceLastTick >= HEARTBEAT_INTERVAL_MS * 2) {
      this.lastInboundFrameAt = now
      this.heartbeatProbeSentAt = null
    }
    // Why: a backgrounded tab shows no live data and the user can't see
    // staleness, so don't spend battery probing; the next visible tick re-checks.
    if (document.visibilityState === 'hidden') {
      return
    }
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN || this.state !== 'connected') {
      return
    }
    // Why: close ONLY when a probe we actually sent has gone unanswered past the
    // grace window — never on raw accumulated silence. This guarantees at least
    // one real round-trip attempt before declaring the socket half-open.
    if (
      this.heartbeatProbeSentAt !== null &&
      now - this.heartbeatProbeSentAt >= HEARTBEAT_PROBE_GRACE_MS
    ) {
      ws.close()
      this.handleSocketClosed(ws)
      return
    }
    if (this.heartbeatProbeSentAt === null && now - this.lastInboundFrameAt >= HEARTBEAT_IDLE_MS) {
      this.sendHeartbeatProbe(now)
    }
  }

  protected sendHeartbeatProbe(now: number): void {
    if (this.pairing.scope === 'runtime' || this.orpcTransport === 'peer') {
      this.heartbeatProbeSentAt = now
      void this.getPeerOrpcClient()
        .status.get(undefined, { signal: AbortSignal.timeout(HEARTBEAT_PROBE_GRACE_MS) })
        .then((status) => this.publishRuntimeId(status.runtimeId))
        .catch(() => {})
      return
    }
    // Why: legacy hosts still need the envelope probe. Its unmatched id keeps
    // the heartbeat fire-and-forget; any inbound reply clears the probe clock.
    if (
      this.sendEncrypted(
        createLegacyRuntimeHeartbeatRequest(
          `web-heartbeat-${this.nextId()}`,
          this.pairing.deviceToken
        )
      )
    ) {
      this.heartbeatProbeSentAt = now
    }
  }

  protected getLegacyOrpcClient(): WebRuntimeOrpcClient {
    if (!this.legacyOrpcClient) {
      this.legacyOrpcClient = createLegacyRuntimeOrpcClient((method, input, options) =>
        this.call(method, input, options)
      )
    }
    return this.legacyOrpcClient
  }

  protected getPeerOrpcClient(): WebRuntimeOrpcClient {
    if (!this.orpcConnection) {
      this.orpcConnection = createWebRuntimeOrpcConnection(
        (plaintext) => this.sendEncryptedText(plaintext),
        (bytes) => this.sendEncryptedBinary(bytes),
        () => this.handleAuthorizationFailure()
      )
    }
    return this.orpcConnection.client
  }

  protected async negotiateOrpcClient(
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<WebRuntimeOrpcClient> {
    const negotiationSignal = signal ?? AbortSignal.timeout(timeoutMs)
    const status = await this.getLegacyOrpcClient().status.get(undefined, {
      signal: negotiationSignal
    })
    this.publishRuntimeId(status.runtimeId)
    if (status.capabilities?.includes(RUNTIME_ORPC_RUNTIME_CAPABILITY)) {
      this.orpcTransport = 'peer'
      return this.getPeerOrpcClient()
    }
    this.orpcTransport = 'legacy'
    return this.getLegacyOrpcClient()
  }

  protected async connectRuntimeOrpcClient(
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<WebRuntimeOrpcClient> {
    const client = this.getPeerOrpcClient()
    const status = await client.status.get(undefined, {
      signal: signal ?? AbortSignal.timeout(timeoutMs)
    })
    this.publishRuntimeId(status.runtimeId)
    this.orpcTransport = 'peer'
    return client
  }

  protected recordRuntimeId(response: RuntimeRpcResponse<unknown>): void {
    const runtimeId = response._meta?.runtimeId
    if (runtimeId) {
      this.publishRuntimeId(runtimeId)
    }
  }

  protected publishRuntimeId(runtimeId: string): void {
    this.authenticatedRuntimeId = runtimeId
    try {
      this.onRuntimeId(runtimeId)
    } catch (error) {
      console.warn('Failed to persist the web runtime identity:', error)
    }
  }
}
