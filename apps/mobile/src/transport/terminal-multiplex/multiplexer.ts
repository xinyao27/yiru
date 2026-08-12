import type { TerminalOpenMultiplexResult } from '@yiru/runtime-protocol/contract'
import { TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import * as ExpoCrypto from 'expo-crypto'

import type { RuntimeOrpcClient } from '../runtime-orpc-client'
import {
  openMobileTerminalBulkConnection,
  type MobileTerminalBulkConnection
} from './bulk-connection'
import { MobileTerminalMultiplexedStream } from './stream'
import type {
  MobileMultiplexedTerminal,
  MobileTerminalMultiplexer,
  MobileTerminalSubscribeArgs
} from './types'
import { MobileTerminalMultiplexWire } from './wire'

const RECONNECT_DELAY_MS = 250
const BACKGROUND_EPOCH_MAX_AGE_MS = 5_000

type MobileTerminalMultiplexerOptions = {
  getControlClient: () => RuntimeOrpcClient
  deviceToken: string
  serverPublicKeyB64: string
}

export class MobileRuntimeTerminalMultiplexer implements MobileTerminalMultiplexer {
  private readonly options: MobileTerminalMultiplexerOptions
  private readonly clientInstanceId = ExpoCrypto.randomUUID()
  private readonly streams = new Map<number, MobileTerminalMultiplexedStream>()
  private readonly wire: MobileTerminalMultiplexWire
  private connection: MobileTerminalBulkConnection | null = null
  private connectPromise: Promise<void> | null = null
  private resolveReady: (() => void) | null = null
  private rejectReady: ((error: Error) => void) | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connectionAttempt = 0
  private nextStreamId = 1
  private nextCorrelationId = 1
  private maxFrameBytes = TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES
  private serverReady = false
  private recovering = false
  private closed = false
  private isControlConnected = false
  private appState: 0 | 1 = 0
  private backgroundedAt: number | null = null

  constructor(options: MobileTerminalMultiplexerOptions) {
    this.options = options
    this.wire = new MobileTerminalMultiplexWire({
      sendBytes: (bytes) => this.connection?.sendTerminalFrame(bytes) ?? false,
      allocateCorrelationId: () => this.allocateCorrelationId(),
      getAppState: () => this.appState,
      getSenderQueueBytes: () => 0,
      onStreamFrame: (frame) => this.streams.get(frame.routeId)?.handle(frame),
      onAccepted: () => this.resolveIfReady(),
      onError: (error) => this.failConnection(this.connectionAttempt, error)
    })
  }

  async subscribeTerminal(args: MobileTerminalSubscribeArgs): Promise<MobileMultiplexedTerminal> {
    if (this.closed) {
      throw new Error('Mobile terminal multiplexer is closed.')
    }
    const control = this.options.getControlClient()
    const [show] = await Promise.all([
      control.terminal.show({ terminal: args.terminal }),
      this.ensureConnected()
    ])
    if (!show.terminal.transportGeneration) {
      throw new Error('Runtime host did not return a terminal transport generation.')
    }
    const streamId = this.allocateStreamId()
    const stream = new MobileTerminalMultiplexedStream({
      streamId,
      terminal: args.terminal,
      transportGeneration: show.terminal.transportGeneration,
      client: args.client,
      ...(args.viewport ? { viewport: args.viewport } : {}),
      delivery: args.delivery ?? { visible: true, interested: true, priority: 'active' },
      callbacks: args.callbacks,
      send: (opcode, routeId, seq, correlationId, payload) =>
        this.wire.send(opcode, routeId, seq, correlationId, payload),
      allocateCorrelationId: () => this.allocateCorrelationId(),
      onClose: (closedStreamId) => {
        this.streams.delete(closedStreamId)
        this.closeIfIdle()
      }
    })
    this.streams.set(streamId, stream)
    if (!stream.subscribe()) {
      this.streams.delete(streamId)
      throw new Error('Mobile terminal multiplex connection is not writable.')
    }
    return stream.publicStream
  }

  setAppState(state: 'foreground' | 'background'): void {
    if (this.closed) {
      return
    }
    if (state === 'background') {
      this.appState = 1
      this.backgroundedAt = Date.now()
      for (const stream of this.streams.values()) {
        stream.suspendForBackground()
      }
      return
    }
    this.appState = 0
    const backgroundAge = this.backgroundedAt === null ? 0 : Date.now() - this.backgroundedAt
    this.backgroundedAt = null
    if (
      backgroundAge > BACKGROUND_EPOCH_MAX_AGE_MS ||
      !this.connection?.isOpen() ||
      !this.wire.isFresh
    ) {
      this.recoverConnection('Mobile terminal resumed with a stale bulk epoch.')
      return
    }
    for (const stream of this.streams.values()) {
      stream.resumeAfterShortBackground()
    }
  }

  controlConnectionChanged(isConnected: boolean): void {
    if (this.closed || this.isControlConnected === isConnected) {
      return
    }
    this.isControlConnected = isConnected
    if (!isConnected) {
      this.recoverConnection('Mobile terminal control generation changed.')
    } else if (this.streams.size > 0 && !this.connection && !this.connectPromise) {
      void this.ensureConnected().catch(() => {})
    }
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    for (const stream of this.streams.values()) {
      stream.transportClosed(true)
    }
    this.streams.clear()
    this.resetConnection()
  }

  private ensureConnected(): Promise<void> {
    if (this.connection?.isOpen() && this.wire.accepted && this.serverReady) {
      return Promise.resolve()
    }
    if (this.connectPromise) {
      return this.connectPromise
    }
    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
      void this.openConnection()
    })
    return this.connectPromise
  }

  private async openConnection(): Promise<void> {
    const attempt = ++this.connectionAttempt
    try {
      const control = this.options.getControlClient()
      const status = await control.status.get(undefined)
      if (!status.capabilities?.includes('terminal.multiplex')) {
        throw new Error('Runtime host does not advertise terminal.multiplex.')
      }
      const ticket = await control.terminal.openMultiplex({
        environmentId: status.runtimeId,
        clientInstanceId: this.clientInstanceId
      })
      this.validateTicket(ticket)
      if (attempt !== this.connectionAttempt) {
        return
      }
      this.maxFrameBytes = ticket.maxFrameBytes
      const requestId = ExpoCrypto.randomUUID()
      openMobileTerminalBulkConnection({
        endpoint: ticket.bulkEndpoint,
        deviceToken: this.options.deviceToken,
        serverPublicKeyB64: this.options.serverPublicKeyB64,
        bulkTicket: ticket.bulkTicket,
        requestId,
        onCreated: (connection) => {
          if (attempt === this.connectionAttempt) {
            this.connection = connection
          } else {
            connection.close()
          }
        },
        onReady: () => {
          if (attempt === this.connectionAttempt) {
            this.serverReady = true
            this.resolveIfReady()
          }
        },
        onBinary: (bytes) => {
          if (attempt === this.connectionAttempt) {
            this.wire.handle(bytes, this.maxFrameBytes)
          }
        },
        onError: (error) => this.failConnection(attempt, error),
        onClose: () => this.failConnection(attempt, new Error('Mobile terminal bulk closed.'))
      })
    } catch (error) {
      this.failConnection(attempt, error instanceof Error ? error : new Error(String(error)))
    }
  }

  private resolveIfReady(): void {
    if (!this.connection?.isOpen() || !this.wire.accepted || !this.serverReady) {
      return
    }
    if (this.recovering) {
      this.recovering = false
      for (const stream of this.streams.values()) {
        if (!stream.resubscribe()) {
          this.failConnection(
            this.connectionAttempt,
            new Error('Mobile terminal recovery subscription was not writable.')
          )
          return
        }
      }
    }
    this.resolveReady?.()
    this.resolveReady = null
    this.rejectReady = null
  }

  private failConnection(attempt: number, error: Error): void {
    if (attempt !== this.connectionAttempt) {
      return
    }
    if (this.streams.size === 0) {
      this.rejectReady?.(error)
      this.resetConnection()
      return
    }
    this.recoverConnection(error.message)
  }

  private recoverConnection(_reason: string): void {
    if (this.closed || (this.recovering && !this.connection && this.connectPromise)) {
      return
    }
    for (const stream of this.streams.values()) {
      stream.transportClosed(false)
    }
    this.recovering = this.streams.size > 0
    this.resetConnection()
    if (this.recovering) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        void this.ensureConnected().catch(() => {})
      }, RECONNECT_DELAY_MS)
    }
  }

  private closeIfIdle(): void {
    if (this.streams.size === 0) {
      this.resetConnection()
    }
  }

  private resetConnection(): void {
    this.connectionAttempt += 1
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const connection = this.connection
    this.connection = null
    this.connectPromise = null
    this.resolveReady = null
    this.rejectReady = null
    this.serverReady = false
    this.nextCorrelationId = 1
    this.wire.reset()
    connection?.close()
  }

  private allocateStreamId(): number {
    if (this.nextStreamId > 0x7fffffff) {
      throw new Error('Mobile terminal stream id space is exhausted.')
    }
    return this.nextStreamId++
  }

  private allocateCorrelationId(): number {
    if (this.nextCorrelationId > 0xffffffff) {
      throw new Error('Mobile terminal correlation id space is exhausted.')
    }
    return this.nextCorrelationId++
  }

  private validateTicket(ticket: TerminalOpenMultiplexResult): void {
    if (
      ticket.expiresAt <= Date.now() ||
      ticket.maxFrameBytes !== TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES ||
      !ticket.bulkEndpoint
    ) {
      throw new Error('Runtime host returned an invalid mobile terminal bulk ticket.')
    }
  }
}
