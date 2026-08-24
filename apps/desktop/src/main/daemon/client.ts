import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Socket } from 'node:net'
import { StringDecoder } from 'node:string_decoder'

import { connectDaemonSocket, sendDaemonHello } from './client-handshake'
import { encodeNdjson, createNdjsonParser } from './ndjson'
import { addNodePtyRecoveryHint } from './node-pty-error-hints'
import { PROTOCOL_VERSION, NOTIFY_PREFIX, DaemonProtocolError } from './types'
import type { RpcResponse, DaemonEvent } from './types'

const REQUEST_TIMEOUT_MS = 30000

export type DaemonClientOptions = {
  socketPath: string
  tokenPath: string
  protocolVersion?: number
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class DaemonClient {
  private socketPath: string
  private tokenPath: string
  private protocolVersion: number
  private clientId = randomUUID()

  private controlSocket: Socket | null = null
  private streamSocket: Socket | null = null
  private connected = false
  private disconnectArmed = false
  // Why: after a disconnect + reconnect (daemon respawn), a stale 'close'
  // event from the old sockets can fire. Without a generation check, that
  // event would tear down the fresh connection. Each doConnect() increments
  // the generation; handleDisconnect ignores events from old generations.
  private connectionGeneration = 0
  // Why: multiple concurrent spawn() calls from simultaneous pane mounts
  // all call ensureConnected(). Without a lock, each starts a separate
  // connection attempt, overwriting sockets and triggering "Connection lost".
  private connectingPromise: Promise<void> | null = null

  private pendingRequests = new Map<string, PendingRequest>()
  private eventListeners: ((event: unknown) => void)[] = []
  private disconnectedListeners: (() => void)[] = []
  private requestCounter = 0
  private cleanupSocketListeners: (() => void) | null = null

  constructor(opts: DaemonClientOptions) {
    this.socketPath = opts.socketPath
    this.tokenPath = opts.tokenPath
    this.protocolVersion = opts.protocolVersion ?? PROTOCOL_VERSION
  }

  isConnected(): boolean {
    return this.connected
  }

  async ensureConnected(): Promise<void> {
    if (this.connected) {
      return
    }
    if (this.connectingPromise) {
      return this.connectingPromise
    }

    this.connectingPromise = this.doConnect()
    try {
      await this.connectingPromise
    } finally {
      this.connectingPromise = null
    }
  }

  private async doConnect(): Promise<void> {
    const token = readFileSync(this.tokenPath, 'utf-8').trim()
    const pendingListenerCleanups: (() => void)[] = []
    const cleanupPendingListeners = (): void => {
      for (const cleanup of pendingListenerCleanups.splice(0)) {
        cleanup()
      }
    }

    try {
      // Sequential: control first, then stream
      this.controlSocket = await connectDaemonSocket(this.socketPath)
      await sendDaemonHello({
        socket: this.controlSocket,
        token,
        role: 'control',
        protocolVersion: this.protocolVersion,
        clientId: this.clientId
      })
      pendingListenerCleanups.push(this.setupControlParser(this.controlSocket))

      this.streamSocket = await connectDaemonSocket(this.socketPath)
      await sendDaemonHello({
        socket: this.streamSocket,
        token,
        role: 'stream',
        protocolVersion: this.protocolVersion,
        clientId: this.clientId
      })
      pendingListenerCleanups.push(this.setupStreamParser(this.streamSocket))

      this.connected = true
      this.disconnectArmed = true
      this.connectionGeneration++

      const gen = this.connectionGeneration
      const handleClose = () => this.handleDisconnect(gen)
      const controlSocket = this.controlSocket
      const streamSocket = this.streamSocket
      controlSocket.on('close', handleClose)
      controlSocket.on('error', handleClose)
      streamSocket.on('close', handleClose)
      streamSocket.on('error', handleClose)
      pendingListenerCleanups.push(() => {
        controlSocket.off('close', handleClose)
        controlSocket.off('error', handleClose)
        streamSocket.off('close', handleClose)
        streamSocket.off('error', handleClose)
      })
      this.cleanupSocketListeners = cleanupPendingListeners
    } catch (error) {
      cleanupPendingListeners()
      this.controlSocket?.destroy()
      this.streamSocket?.destroy()
      this.controlSocket = null
      this.streamSocket = null
      this.connected = false
      this.disconnectArmed = false
      throw error
    }
  }

  async request<T = unknown>(type: string, payload: unknown): Promise<T> {
    if (!this.connected || !this.controlSocket) {
      throw new DaemonProtocolError('Not connected')
    }

    const id = `req-${++this.requestCounter}`
    const msg = { id, type, ...(payload !== undefined ? { payload } : {}) }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new DaemonProtocolError(`Request ${type} timed out after ${REQUEST_TIMEOUT_MS}ms`))
      }, REQUEST_TIMEOUT_MS)

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer
      })

      this.controlSocket!.write(encodeNdjson(msg))
    })
  }

  notify(type: string, payload: unknown): void {
    if (!this.connected || !this.controlSocket) {
      return
    }

    const id = `${NOTIFY_PREFIX}${++this.requestCounter}`
    const msg = { id, type, ...(payload !== undefined ? { payload } : {}) }
    this.controlSocket.write(encodeNdjson(msg))
  }

  onEvent(listener: (event: unknown) => void): () => void {
    this.eventListeners.push(listener)
    return () => {
      const idx = this.eventListeners.indexOf(listener)
      if (idx !== -1) {
        this.eventListeners.splice(idx, 1)
      }
    }
  }

  onDisconnected(listener: () => void): () => void {
    this.disconnectedListeners.push(listener)
    return () => {
      const idx = this.disconnectedListeners.indexOf(listener)
      if (idx !== -1) {
        this.disconnectedListeners.splice(idx, 1)
      }
    }
  }

  disconnect(): void {
    this.connected = false
    this.disconnectArmed = false
    this.cleanupActiveSocketListeners()

    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new DaemonProtocolError('Disconnected'))
      this.pendingRequests.delete(id)
    }

    this.controlSocket?.destroy()
    this.streamSocket?.destroy()
    this.controlSocket = null
    this.streamSocket = null
  }

  private setupControlParser(socket: Socket): () => void {
    // Why: control responses may contain terminal/startup data with multibyte
    // text; keep incomplete UTF-8 bytes until the next socket chunk.
    const decoder = new StringDecoder('utf8')
    const parser = createNdjsonParser(
      (msg) => {
        const response = msg as RpcResponse
        if (response.id) {
          const pending = this.pendingRequests.get(response.id)
          if (pending) {
            this.pendingRequests.delete(response.id)
            clearTimeout(pending.timer)
            if (response.ok) {
              pending.resolve(response.payload)
            } else {
              pending.reject(new DaemonProtocolError(addNodePtyRecoveryHint(response.error)))
            }
          }
        }
      },
      () => {} // Ignore parse errors on control socket
    )

    const onData = (chunk: Buffer) => parser.feed(decoder.write(chunk))
    socket.on('data', onData)
    return () => socket.off('data', onData)
  }

  private setupStreamParser(socket: Socket): () => void {
    // Why: PTY output streams include emoji/box-drawing tables; socket chunks
    // can split those UTF-8 sequences across packets.
    const decoder = new StringDecoder('utf8')
    const parser = createNdjsonParser(
      (msg) => {
        const event = msg as DaemonEvent
        if (event.type === 'event') {
          for (const listener of this.eventListeners) {
            listener(event)
          }
        }
      },
      () => {} // Ignore parse errors on stream socket
    )

    const onData = (chunk: Buffer) => parser.feed(decoder.write(chunk))
    socket.on('data', onData)
    return () => socket.off('data', onData)
  }

  private handleDisconnect(generation: number): void {
    if (!this.disconnectArmed || generation !== this.connectionGeneration) {
      return
    }
    this.disconnectArmed = false
    this.connected = false
    this.cleanupActiveSocketListeners()

    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new DaemonProtocolError('Connection lost'))
      this.pendingRequests.delete(id)
    }

    this.controlSocket?.destroy()
    this.streamSocket?.destroy()
    this.controlSocket = null
    this.streamSocket = null

    for (const listener of this.disconnectedListeners) {
      listener()
    }
  }

  private cleanupActiveSocketListeners(): void {
    const cleanup = this.cleanupSocketListeners
    this.cleanupSocketListeners = null
    cleanup?.()
  }
}
