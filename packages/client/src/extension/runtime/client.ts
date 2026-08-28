import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/websocket'
import type { ContractRouterClient, runtimeContract } from '@yiru/runtime-protocol/contract'

import type { RuntimeOrpcClient } from '../../runtime/orpc-connection'
import type { ExtensionRuntimeBootstrap } from './session'
import { ExtensionSocketMultiplexer } from './socket'
import { extensionRuntimeSocketUrl, waitForExtensionRuntimeSocket } from './socket-endpoint'

export type ExtensionRuntimeOrpcClient = RuntimeOrpcClient &
  ContractRouterClient<typeof runtimeContract>
export type ExtensionConnectionState = 'connecting' | 'connected' | 'reconnecting'

export class ExtensionRuntimeClient {
  private clientPromise: Promise<ExtensionRuntimeOrpcClient> | null = null
  private connectionState: ExtensionConnectionState = 'connecting'
  private readonly credentials: ExtensionRuntimeBootstrap
  private isClosed = false
  private readonly listeners = new Set<() => void>()
  private multiplexer: ExtensionSocketMultiplexer | null = null
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private socket: WebSocket | null = null

  constructor(credentials: ExtensionRuntimeBootstrap) {
    this.credentials = credentials
  }

  async getOrpcClient(timeoutMs = 12_000): Promise<ExtensionRuntimeOrpcClient> {
    if (this.isClosed) {
      throw new Error('extension_runtime_client_closed')
    }
    if (!this.clientPromise) {
      this.setConnectionState(this.socket ? 'reconnecting' : this.connectionState)
      this.clientPromise = this.connect(timeoutMs)
    }
    try {
      return await this.clientPromise
    } catch (error) {
      this.clientPromise = null
      this.setConnectionState('reconnecting')
      this.scheduleReconnect()
      throw error
    }
  }

  close(): void {
    this.isClosed = true
    this.clearReconnectTimer()
    this.multiplexer?.close()
    this.multiplexer = null
    this.socket?.close(1000, 'Client closed')
    this.socket = null
    this.clientPromise = null
  }

  getConnectionState(): ExtensionConnectionState {
    return this.connectionState
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async connect(timeoutMs: number): Promise<ExtensionRuntimeOrpcClient> {
    const socket = new WebSocket(extensionRuntimeSocketUrl(this.credentials))
    this.socket = socket
    await waitForExtensionRuntimeSocket(socket, timeoutMs)
    const multiplexer = new ExtensionSocketMultiplexer(socket)
    this.multiplexer = multiplexer
    if (!multiplexer.connectShellServices()) {
      multiplexer.close()
      this.multiplexer = null
      socket.close(1011, 'Shell services unavailable')
      throw new Error('extension_shell_services_unavailable')
    }
    this.setConnectionState('connected')
    this.reconnectAttempt = 0
    this.clearReconnectTimer()
    socket.addEventListener('close', () => {
      if (this.socket === socket) {
        multiplexer.close()
        this.multiplexer = null
        this.socket = null
        this.clientPromise = null
        this.setConnectionState('reconnecting')
        this.scheduleReconnect()
      }
    })
    return createORPCClient<ExtensionRuntimeOrpcClient>(
      new RPCLink({ websocket: multiplexer.rpcSocket })
    )
  }

  private setConnectionState(state: ExtensionConnectionState): void {
    if (state === this.connectionState) {
      return
    }
    this.connectionState = state
    for (const listener of this.listeners) {
      listener()
    }
  }

  private scheduleReconnect(): void {
    if (this.isClosed || this.reconnectTimer || this.clientPromise) {
      return
    }
    const exponentialMs = Math.min(30_000, 500 * 2 ** Math.min(this.reconnectAttempt, 6))
    const delayMs = exponentialMs + Math.floor(Math.random() * Math.min(1_000, exponentialMs / 4))
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.getOrpcClient().catch(() => {})
    }, delayMs)
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return
    }
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }
}
