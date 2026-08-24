import {
  FrameDecoder,
  KEEPALIVE_SEND_MS,
  MessageType,
  TIMEOUT_MS,
  encodeJsonRpcFrame,
  encodeKeepAliveFrame,
  parseJsonRpcMessage
} from './frame-codec'
import type {
  DecodedFrame,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse
} from './frame-codec'
import { PendingRequestRegistry } from './pending-requests'
import { MultiplexerSubscriptions } from './subscriptions'
import type {
  MethodNotificationHandler,
  NotificationHandler,
  RequestHandler
} from './subscriptions'

export type {
  MethodNotificationHandler,
  NotificationHandler,
  RequestHandler
} from './subscriptions'

export type MultiplexerTransport = {
  write: (data: Buffer) => void
  onData: (callback: (data: Buffer) => void) => void
  onClose: (callback: () => void) => void
  close?: () => void
}

const WAKE_GAP_MS = KEEPALIVE_SEND_MS * 3

export class ChannelMultiplexer {
  private decoder: FrameDecoder
  private transport: MultiplexerTransport
  private requests = new PendingRequestRegistry()
  private subscriptions = new MultiplexerSubscriptions()
  private nextOutgoingSeq = 1
  private highestReceivedSeq = 0
  private highestAckedBySelf = 0
  private lastReceivedAt = Date.now()
  private disposeHandlers: ((reason: 'shutdown' | 'connection_lost') => void)[] = []
  private connectionHealthTimer: ReturnType<typeof setInterval> | null = null
  private disposed = false
  private unackedTimestamps = new Map<number, number>()
  private livenessProbeWaiters: { succeed: () => void; fail: () => void }[] = []

  constructor(transport: MultiplexerTransport) {
    this.transport = transport
    this.decoder = new FrameDecoder(
      (frame) => this.handleFrame(frame),
      (error) => this.handleProtocolError(error)
    )
    transport.onData((data) => {
      if (!this.disposed) {
        this.lastReceivedAt = Date.now()
        this.decoder.feed(data)
      }
    })
    transport.onClose(() => this.dispose('connection_lost'))
    if (!this.disposed) {
      this.startConnectionHealthTimer()
    }
  }

  onNotification(handler: NotificationHandler): () => void {
    return this.disposed ? () => {} : this.subscriptions.onNotification(handler)
  }

  onNotificationByMethod(method: string, handler: MethodNotificationHandler): () => void {
    return this.disposed ? () => {} : this.subscriptions.onNotificationByMethod(method, handler)
  }

  onRequest(method: string, handler: RequestHandler): () => void {
    return this.disposed ? () => {} : this.subscriptions.onRequest(method, handler)
  }

  onDispose(handler: (reason: 'shutdown' | 'connection_lost') => void): () => void {
    if (this.disposed) {
      return () => {}
    }
    this.disposeHandlers.push(handler)
    return () => {
      const index = this.disposeHandlers.indexOf(handler)
      if (index !== -1) {
        this.disposeHandlers.splice(index, 1)
      }
    }
  }

  async request(
    method: string,
    params?: Record<string, unknown>,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<unknown> {
    if (this.disposed) {
      throw new Error('Multiplexer disposed')
    }
    return this.requests.request(
      method,
      params,
      options,
      (message) => this.sendMessage(message),
      (id) => this.notify('rpc.cancel', { id })
    )
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
    this.sendMessage(message)
  }

  probeLiveness(timeoutMs: number): Promise<boolean> {
    if (this.disposed) {
      return Promise.resolve(false)
    }
    return new Promise((resolve) => {
      const settle = (alive: boolean): void => {
        clearTimeout(timer)
        const index = this.livenessProbeWaiters.indexOf(waiter)
        if (index !== -1) {
          this.livenessProbeWaiters.splice(index, 1)
        }
        resolve(alive)
      }
      const waiter = { succeed: () => settle(true), fail: () => settle(false) }
      const timer = setTimeout(() => settle(false), timeoutMs)
      this.livenessProbeWaiters.push(waiter)
      this.sendKeepAlive()
    })
  }

  dispose(reason: 'shutdown' | 'connection_lost' = 'shutdown'): void {
    if (this.disposed) {
      return
    }
    if (process.env.YIRU_CHANNEL_MUX_DEBUG === '1') {
      console.warn(
        `[channel-mux] Disposing multiplexer (reason: ${reason})`,
        new Error('dispose trace').stack
      )
    }
    this.disposed = true
    if (this.connectionHealthTimer) {
      clearInterval(this.connectionHealthTimer)
      this.connectionHealthTimer = null
    }
    for (const waiter of this.livenessProbeWaiters.splice(0)) {
      waiter.fail()
    }
    this.requests.dispose(reason)
    this.unackedTimestamps.clear()
    this.subscriptions.dispose()
    this.decoder.reset()
    this.transport.close?.()
    for (const handler of this.disposeHandlers) {
      try {
        handler(reason)
      } catch {
        // Why: every owner must receive teardown even if an earlier callback fails.
      }
    }
    this.disposeHandlers.length = 0
  }

  isDisposed(): boolean {
    return this.disposed
  }

  private sendMessage(message: JsonRpcMessage): void {
    const sequence = this.nextOutgoingSeq++
    const frame = encodeJsonRpcFrame(message, sequence, this.highestReceivedSeq)
    this.writeFrame(sequence, frame)
  }

  private sendKeepAlive(): void {
    if (this.disposed) {
      return
    }
    const sequence = this.nextOutgoingSeq++
    const frame = encodeKeepAliveFrame(sequence, this.highestReceivedSeq)
    this.writeFrame(sequence, frame)
  }

  private writeFrame(sequence: number, frame: Buffer): void {
    this.unackedTimestamps.set(sequence, Date.now())
    try {
      this.transport.write(frame)
    } catch (error) {
      this.handleProtocolError(error)
    }
  }

  private handleFrame(frame: DecodedFrame): void {
    for (const waiter of this.livenessProbeWaiters.splice(0)) {
      waiter.succeed()
    }
    this.highestReceivedSeq = Math.max(this.highestReceivedSeq, frame.id)
    if (frame.ack > this.highestAckedBySelf) {
      for (let sequence = this.highestAckedBySelf + 1; sequence <= frame.ack; sequence++) {
        this.unackedTimestamps.delete(sequence)
      }
      this.highestAckedBySelf = frame.ack
    }
    if (frame.type !== MessageType.Regular) {
      return
    }
    try {
      this.handleMessage(parseJsonRpcMessage(frame.payload))
    } catch (error) {
      this.handleProtocolError(error)
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if ('id' in message && ('result' in message || 'error' in message)) {
      this.requests.handleResponse(message as JsonRpcResponse)
    } else if ('id' in message && 'method' in message) {
      void this.subscriptions.handleRequest(message as JsonRpcRequest, (response) =>
        this.sendMessage(response)
      )
    } else if ('method' in message && !('id' in message)) {
      this.subscriptions.handleNotification(message as JsonRpcNotification)
    }
  }

  private startConnectionHealthTimer(): void {
    let lastTickAt = Date.now()
    this.connectionHealthTimer = setInterval(() => {
      this.sendKeepAlive()
      if (this.disposed) {
        return
      }
      const now = Date.now()
      const sinceLastTick = now - lastTickAt
      lastTickAt = now
      if (sinceLastTick > WAKE_GAP_MS) {
        this.lastReceivedAt = now
        for (const sequence of this.unackedTimestamps.keys()) {
          this.unackedTimestamps.set(sequence, now)
        }
        this.sendKeepAlive()
        return
      }
      const noDataReceived = now - this.lastReceivedAt > TIMEOUT_MS
      let oldestUnacked = Infinity
      for (const timestamp of this.unackedTimestamps.values()) {
        oldestUnacked = Math.min(oldestUnacked, timestamp)
      }
      const oldestUnackedStale = oldestUnacked !== Infinity && now - oldestUnacked > TIMEOUT_MS
      if (noDataReceived && oldestUnackedStale) {
        this.handleProtocolError(new Error('Connection timed out (no ack received)'))
      }
    }, KEEPALIVE_SEND_MS)
  }

  private handleProtocolError(error: unknown): void {
    console.warn(
      `[channel-mux] Protocol error: ${error instanceof Error ? error.message : String(error)}`
    )
    this.dispose('connection_lost')
  }
}
