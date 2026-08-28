import { randomUUID } from 'node:crypto'

import type {
  RemoteRuntimeOrpcTunnel,
  SharedControlOrpcTunnelCallbacks
} from '@yiru/runtime-protocol/workbench/remote-runtime/shared-control-types'

import {
  encodeRuntimeOrpcAbortFrame,
  encodeRuntimeOrpcUnavailableResponseFrame,
  namespaceRuntimeOrpcRequestFrame,
  routeRuntimeOrpcResponseFrame,
  type RuntimeOrpcTunnelFrame
} from './orpc-tunnel-frame'
import { remoteRuntimeUnavailableError } from './request-frames'

type ActiveOrpcTunnel = {
  ownerId: string
  namespace: string
  callbacks: SharedControlOrpcTunnelCallbacks
  requestIds: Map<string, string | null>
}

type OrpcTunnelCloseMode = 'abort_remote' | 'route_lost'

export class SharedControlOrpcTunnels {
  private readonly tunnelsByOwnerId = new Map<string, ActiveOrpcTunnel>()
  private readonly tunnelsByNamespace = new Map<string, ActiveOrpcTunnel>()
  private readonly tunnelsByCorrelationId = new Map<string, ActiveOrpcTunnel>()

  private readonly options: {
    ensureReady: (timeoutMs: number) => Promise<void>
    sendText: (frame: string) => boolean
    sendBinary: (frame: Uint8Array<ArrayBufferLike>) => boolean
  }

  constructor(options: {
    ensureReady: (timeoutMs: number) => Promise<void>
    sendText: (frame: string) => boolean
    sendBinary: (frame: Uint8Array<ArrayBufferLike>) => boolean
  }) {
    this.options = options
  }

  async connect(
    ownerId: string,
    timeoutMs: number,
    callbacks: SharedControlOrpcTunnelCallbacks
  ): Promise<RemoteRuntimeOrpcTunnel> {
    const existing = this.tunnelsByOwnerId.get(ownerId)
    if (existing) {
      this.closeTunnel(
        existing,
        remoteRuntimeUnavailableError('Runtime oRPC tunnel was replaced.'),
        'abort_remote'
      )
    }
    const tunnel: ActiveOrpcTunnel = {
      ownerId,
      namespace: randomUUID(),
      callbacks,
      requestIds: new Map()
    }
    this.tunnelsByOwnerId.set(ownerId, tunnel)
    this.tunnelsByNamespace.set(tunnel.namespace, tunnel)
    try {
      await this.options.ensureReady(timeoutMs)
    } catch (error) {
      if (this.isActive(tunnel)) {
        this.removeTunnel(tunnel)
      }
      throw error
    }
    if (!this.isActive(tunnel)) {
      throw remoteRuntimeUnavailableError('Runtime oRPC tunnel was replaced before connecting.')
    }
    return {
      sendText: (frame) => this.send(tunnel, frame),
      sendBinary: (frame) => this.send(tunnel, frame),
      close: () => this.closeTunnel(tunnel, remoteRuntimeUnavailableError(), 'abort_remote')
    }
  }

  handleText(frame: string): void {
    this.handleResponse(frame)
  }

  handleBinary(frame: Uint8Array<ArrayBufferLike>): void {
    this.handleResponse(frame)
  }

  handleSideChannel(requestId: string, frame: Uint8Array<ArrayBufferLike>): void {
    const tunnel = this.tunnelsByCorrelationId.get(requestId)
    if (tunnel && this.isActive(tunnel)) {
      tunnel.callbacks.onSideChannelBinary(requestId, frame)
    }
  }

  closeAll(error: Error): void {
    for (const tunnel of Array.from(this.tunnelsByOwnerId.values())) {
      // Why: the peer WebSocket is already closing, so its server handler closes
      // every pending request without explicit abort frames.
      this.closeTunnel(tunnel, error, 'route_lost')
    }
  }

  private send(tunnel: ActiveOrpcTunnel, frame: RuntimeOrpcTunnelFrame): boolean {
    if (!this.isActive(tunnel)) {
      return false
    }
    const namespaced = namespaceRuntimeOrpcRequestFrame(frame, tunnel.namespace)
    if (!namespaced) {
      this.closeTunnel(
        tunnel,
        remoteRuntimeUnavailableError('Renderer sent an invalid oRPC peer frame.'),
        'abort_remote'
      )
      return false
    }
    if (namespaced.type === 1) {
      this.trackRequest(tunnel, namespaced.requestId, namespaced.correlationId)
    } else if (namespaced.type === 4) {
      this.forgetRequest(tunnel, namespaced.requestId)
    }
    const sent =
      typeof namespaced.frame === 'string'
        ? this.options.sendText(namespaced.frame)
        : this.options.sendBinary(namespaced.frame)
    if (!sent) {
      this.closeTunnel(tunnel, remoteRuntimeUnavailableError(), 'route_lost')
    }
    return sent
  }

  private handleResponse(frame: RuntimeOrpcTunnelFrame): void {
    const routed = routeRuntimeOrpcResponseFrame(frame)
    if (!routed) {
      return
    }
    const tunnel = this.tunnelsByNamespace.get(routed.namespace)
    if (!tunnel) {
      return
    }
    if (routed.isComplete) {
      this.forgetRequest(tunnel, routed.requestId)
    }
    if (typeof routed.frame === 'string') {
      tunnel.callbacks.onText(routed.frame)
    } else {
      tunnel.callbacks.onBinary(routed.frame)
    }
  }

  private closeTunnel(tunnel: ActiveOrpcTunnel, error: Error, mode: OrpcTunnelCloseMode): void {
    if (!this.isActive(tunnel)) {
      return
    }
    this.removeTunnel(tunnel)
    const closeError = tunnel.callbacks.formatCloseError?.(error) ?? error
    if (mode === 'abort_remote') {
      for (const requestId of tunnel.requestIds.keys()) {
        this.options.sendText(encodeRuntimeOrpcAbortFrame(tunnel.namespace, requestId))
      }
    } else {
      for (const requestId of tunnel.requestIds.keys()) {
        tunnel.callbacks.onText(
          encodeRuntimeOrpcUnavailableResponseFrame(requestId, closeError.message)
        )
      }
    }
    for (const requestId of Array.from(tunnel.requestIds.keys())) {
      this.forgetRequest(tunnel, requestId)
    }
    tunnel.callbacks.onClose(closeError)
  }

  private trackRequest(
    tunnel: ActiveOrpcTunnel,
    requestId: string,
    correlationId: string | null
  ): void {
    this.forgetRequest(tunnel, requestId)
    tunnel.requestIds.set(requestId, correlationId)
    if (correlationId) {
      this.tunnelsByCorrelationId.set(correlationId, tunnel)
    }
  }

  private forgetRequest(tunnel: ActiveOrpcTunnel, requestId: string): void {
    const correlationId = tunnel.requestIds.get(requestId)
    tunnel.requestIds.delete(requestId)
    if (correlationId && this.tunnelsByCorrelationId.get(correlationId) === tunnel) {
      this.tunnelsByCorrelationId.delete(correlationId)
    }
  }

  private removeTunnel(tunnel: ActiveOrpcTunnel): void {
    if (this.tunnelsByOwnerId.get(tunnel.ownerId) === tunnel) {
      this.tunnelsByOwnerId.delete(tunnel.ownerId)
    }
    if (this.tunnelsByNamespace.get(tunnel.namespace) === tunnel) {
      this.tunnelsByNamespace.delete(tunnel.namespace)
    }
  }

  private isActive(tunnel: ActiveOrpcTunnel): boolean {
    return (
      this.tunnelsByOwnerId.get(tunnel.ownerId) === tunnel &&
      this.tunnelsByNamespace.get(tunnel.namespace) === tunnel
    )
  }
}
