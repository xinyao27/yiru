import {
  KEEPALIVE_SEND_MS,
  MessageType,
  parseJsonRpcMessage,
  type DecodedFrame,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse
} from './protocol'
import { RelayClient } from './relay-client'
import type { RelayClientSinkOptions, RelayClientWrite } from './relay-client'
import { RelayInboundRouter } from './relay-inbound-router'
import type { MethodHandler, NotificationHandler } from './relay-inbound-router'
import { RelayRequestQueue } from './relay-request-queue'

export type { RelayClientSinkOptions, RelayClientWrite } from './relay-client'
export type { MethodHandler, NotificationHandler, RequestContext } from './relay-inbound-router'

export class RelayDispatcher {
  private readonly primaryClient: RelayClient
  private readonly clients = new Map<number, RelayClient>()
  private readonly inboundRouter: RelayInboundRouter
  private readonly relayRequests = new RelayRequestQueue()
  private readonly clientDetachListeners = new Set<(clientId: number) => void>()
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null
  private disposed = false
  private nextClientId = 1

  constructor(write: RelayClientWrite, sinkOptions?: RelayClientSinkOptions) {
    this.inboundRouter = new RelayInboundRouter(
      (client, generation) =>
        client.generation === generation && this.clients.has(client.id) && !client.closed,
      (client, id, result, error) => this.sendResponse(client, id, result, error)
    )
    this.primaryClient = this.createClient(write, sinkOptions)
    this.clients.set(this.primaryClient.id, this.primaryClient)
    this.startKeepalive()
  }

  // Why: reconnecting through a Unix socket must preserve the dispatcher handler
  // tree while resetting the per-channel decoder and sequence number space.
  setWrite(write: RelayClientWrite, sinkOptions?: RelayClientSinkOptions): void {
    this.inboundRouter.abortClient(this.primaryClient.id)
    this.primaryClient.replaceSink(write, sinkOptions)
  }

  // Why: completed mutating work must become stale as soon as its owner leaves,
  // even before a replacement client attaches.
  invalidateClient(): void {
    this.inboundRouter.abortClient(this.primaryClient.id)
    this.primaryClient.invalidate()
    this.notifyClientDetached(this.primaryClient.id)
  }

  attachClient(write: RelayClientWrite, sinkOptions?: RelayClientSinkOptions): number {
    const client = this.createClient(write, sinkOptions)
    this.clients.set(client.id, client)
    return client.id
  }

  detachClient(clientId: number): void {
    const client = this.clients.get(clientId)
    if (!client || client === this.primaryClient) {
      return
    }
    this.inboundRouter.abortClient(clientId)
    client.invalidate()
    this.clients.delete(clientId)
    this.notifyClientDetached(clientId)
  }

  feedClient(clientId: number, data: Buffer): void {
    const client = this.clients.get(clientId)
    if (client) {
      this.feedForClient(client, data)
    }
  }

  feed(data: Buffer): void {
    this.feedForClient(this.primaryClient, data)
  }

  onRequest(method: string, handler: MethodHandler): void {
    this.inboundRouter.onRequest(method, handler)
  }

  onNotification(method: string, handler: NotificationHandler): void {
    this.inboundRouter.onNotification(method, handler)
  }

  onClientDetached(listener: (clientId: number) => void): () => void {
    this.clientDetachListeners.add(listener)
    return () => this.clientDetachListeners.delete(listener)
  }

  notify(method: string, params?: Record<string, unknown>): void {
    if (this.disposed) {
      return
    }
    const message: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {})
    }
    for (const client of this.clients.values()) {
      client.send(message)
    }
  }

  notifyClient(clientId: number, method: string, params?: Record<string, unknown>): void {
    if (this.disposed) {
      return
    }
    const client = this.clients.get(clientId)
    if (!client || client.closed) {
      return
    }
    client.send({
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {})
    })
  }

  notifyBulk(
    method: string,
    params?: Record<string, unknown>,
    options?: { clientId?: number }
  ): Promise<void> {
    if (this.disposed) {
      return Promise.resolve()
    }
    const message: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {})
    }
    const targets =
      options?.clientId !== undefined
        ? [this.clients.get(options.clientId)].filter(
            (client): client is RelayClient => client !== undefined
          )
        : Array.from(this.clients.values())
    const waits = targets
      .filter((client) => !client.closed)
      .map((client) => client.enqueueBulk(message, () => this.disposed))
    return waits.length === 0 ? Promise.resolve() : Promise.all(waits).then(() => {})
  }

  requestPrimary(
    method: string,
    params?: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<unknown> {
    return this.requestClient(this.primaryClient.id, method, params, options)
  }

  requestAnyClient(
    method: string,
    params?: Record<string, unknown>,
    options?: { timeoutMs?: number; excludeClientId?: number }
  ): Promise<unknown> {
    const candidates = Array.from(this.clients.values()).filter(
      (client) => !client.closed && client.id !== options?.excludeClientId
    )
    // Why: a detached synthetic primary may remain for setWrite reuse. Prefer a
    // real socket client so shims do not forward requests to dead stdout.
    const target = candidates.find((client) => client !== this.primaryClient) ?? candidates[0]
    if (!target) {
      return Promise.reject(new Error('No owning Yiru client is connected to the relay'))
    }
    return this.requestClient(target.id, method, params, options)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
    this.relayRequests.dispose()
    this.inboundRouter.dispose()
    for (const client of this.clients.values()) {
      client.flushDrainWaiters()
    }
  }

  private feedForClient(client: RelayClient, data: Buffer): void {
    if (this.disposed) {
      return
    }
    try {
      client.feed(data)
    } catch (error) {
      process.stderr.write(
        `[relay] Protocol error: ${error instanceof Error ? error.message : String(error)}\n`
      )
    }
  }

  private requestClient(
    clientId: number,
    method: string,
    params?: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<unknown> {
    const client = this.clients.get(clientId)
    if (this.disposed || !client || client.closed) {
      return Promise.reject(new Error('Relay client is not connected'))
    }
    return this.relayRequests.request(method, params, options, (message) => {
      client.send(message)
    })
  }

  private createClient(write: RelayClientWrite, sinkOptions?: RelayClientSinkOptions): RelayClient {
    return new RelayClient(
      this.nextClientId++,
      write,
      sinkOptions,
      (client, frame) => this.handleFrame(client, frame),
      (client, error) => this.handleClientWriteFailure(client, error)
    )
  }

  private handleFrame(client: RelayClient, frame: DecodedFrame): void {
    client.receiveFrame(frame)
    if (frame.type === MessageType.KeepAlive) {
      return
    }
    if (frame.type !== MessageType.Regular) {
      return
    }
    try {
      this.handleMessage(client, parseJsonRpcMessage(frame.payload))
    } catch (error) {
      process.stderr.write(
        `[relay] Parse error: ${error instanceof Error ? error.message : String(error)}\n`
      )
    }
  }

  private handleMessage(
    client: RelayClient,
    message: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse
  ): void {
    if ('method' in message) {
      if ('id' in message) {
        void this.inboundRouter.handleRequest(client, message)
      } else {
        this.inboundRouter.handleNotification(client, message)
      }
      return
    }
    this.relayRequests.handleResponse(message)
  }

  private sendResponse(
    client: RelayClient,
    id: number,
    result?: unknown,
    error?: { code: number; message: string; data?: unknown }
  ): void {
    const message: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      ...(error ? { error } : { result: result ?? null })
    }
    if (!this.disposed) {
      client.send(message)
    }
  }

  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      if (!this.disposed) {
        for (const client of this.clients.values()) {
          client.sendKeepAlive()
        }
      }
    }, KEEPALIVE_SEND_MS)
    // Why: keepalive must not keep an otherwise idle relay process alive.
    this.keepaliveTimer.unref()
  }

  private handleClientWriteFailure(client: RelayClient, error: unknown): void {
    this.inboundRouter.abortClient(client.id)
    // Why: a thrown write means a frame was lost with no retransmit buffer.
    // Detaching immediately lets reconnect and PTY replay repair the stream.
    if (client !== this.primaryClient) {
      this.clients.delete(client.id)
    }
    this.notifyClientDetached(client.id)
    process.stderr.write(
      `[relay] Client write failed: ${error instanceof Error ? error.message : String(error)}\n`
    )
  }

  private notifyClientDetached(clientId: number): void {
    for (const listener of this.clientDetachListeners) {
      try {
        listener(clientId)
      } catch (error) {
        process.stderr.write(
          `[relay] Client detach listener failed: ${error instanceof Error ? error.message : String(error)}\n`
        )
      }
    }
  }
}
