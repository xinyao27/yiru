import {
  decodeTerminalMultiplexEpochRecord,
  decodeTerminalMultiplexHeartbeatRecord,
  encodeTerminalMultiplexEpochRecord,
  encodeTerminalMultiplexHeartbeatRecord
} from '@yiru/runtime-protocol/terminal-multiplex/connection-records'
import {
  TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES,
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame
} from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { encodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'
import type { RpcContext } from '~main/runtime/rpc/core'
import { bindSubscriptionAbort } from '~main/runtime/rpc/methods/subscription-abort'

import { decodeTerminalMultiplexSubscribe } from '../stream/records'
import { TerminalMultiplexStream } from '../stream/stream'
import { TerminalMultiplexTelemetry } from '../telemetry'
import {
  randomTerminalMultiplexConnectionGeneration,
  randomTerminalMultiplexEpoch,
  TerminalMultiplexIdSequence,
  terminalMultiplexMonotonicMicros
} from './clock'
import { TerminalMultiplexSessionSender } from './sender'

const HEARTBEAT_MS = 15_000
const MAX_STREAMS = 1_024

type TerminalMultiplexEvent = { type: 'ready' }

export class TerminalMultiplexSession {
  private readonly context: RpcContext
  private readonly emit: (event: TerminalMultiplexEvent) => void
  private readonly epoch = randomTerminalMultiplexEpoch()
  private readonly connectionGeneration = randomTerminalMultiplexConnectionGeneration()
  private readonly streams = new Map<number, TerminalMultiplexStream>()
  private readonly pendingHeartbeats = new Map<number, bigint>()
  private phase: 'offer' | 'heartbeat' | 'ready' | 'closed' = 'offer'
  private readonly snapshotIds = new TerminalMultiplexIdSequence()
  private readonly heartbeatIds = new TerminalMultiplexIdSequence()
  private readonly telemetry: TerminalMultiplexTelemetry
  private readonly sender: TerminalMultiplexSessionSender
  private connectionInFlightBytes = 0
  private connectionId = ''
  private lastStreamId = 0
  private lastAuthenticatedFrameAt = Date.now()
  private removeAbort = (): void => {}
  private unregisterBinary = (): void => {}
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private resolveClosed = (): void => {}
  private readonly closed = new Promise<void>((resolve) => {
    this.resolveClosed = resolve
  })

  constructor(context: RpcContext, emit: (event: TerminalMultiplexEvent) => void) {
    this.context = context
    this.emit = emit
    this.telemetry = new TerminalMultiplexTelemetry(context.clientKind ?? 'runtime-socket')
    this.sender = new TerminalMultiplexSessionSender(context.sendBinary, this.epoch, this.telemetry)
  }

  async run(): Promise<void> {
    const { connectionId, registerBinaryStreamHandler, sendBinary } = this.context
    if (!connectionId || !registerBinaryStreamHandler || !sendBinary) {
      throw new Error('binary_terminal_stream_required')
    }
    this.connectionId = connectionId
    this.unregisterBinary = registerBinaryStreamHandler(0, (frame) => this.handle(frame))
    const subscriptionId = `terminal-multiplex:${connectionId}`
    this.context.runtime.registerSubscriptionCleanup(
      subscriptionId,
      () => this.close(),
      connectionId
    )
    this.removeAbort = bindSubscriptionAbort(
      this.context.runtime,
      subscriptionId,
      this.context.signal
    )
    this.sender.send(
      TerminalMultiplexOpcode.Epoch,
      0,
      0n,
      0,
      encodeTerminalMultiplexEpochRecord({
        phase: 0,
        protocolMinor: 0,
        maxFrameBytes: TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES,
        maxStreams: MAX_STREAMS,
        heartbeatMs: HEARTBEAT_MS,
        connectionGeneration: this.connectionGeneration
      })
    )
    await this.closed
  }

  private handle(frame: TerminalMultiplexFrame): void {
    if (this.phase === 'closed') {
      return
    }
    this.telemetry.noteFrame('received', frame.opcode, frame.payload.byteLength + 40)
    if (frame.epoch < this.epoch) {
      return
    }
    if (frame.epoch > this.epoch) {
      this.protocolClose(1002, 'future epoch')
      return
    }
    this.lastAuthenticatedFrameAt = Date.now()
    if (frame.opcode === TerminalMultiplexOpcode.Epoch) {
      this.handleEpoch(frame)
      return
    }
    if (this.phase === 'offer') {
      this.protocolClose(1002, 'epoch not accepted')
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.Heartbeat) {
      this.handleHeartbeat(frame)
      return
    }
    if (this.phase !== 'ready') {
      this.protocolClose(1002, 'heartbeat not established')
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.Subscribe) {
      this.handleSubscribe(frame)
      return
    }
    const stream = this.streams.get(frame.routeId)
    if (!stream) {
      this.sendError(frame.routeId, frame.correlationId, 'unknown_stream', false)
      return
    }
    stream.handle(frame)
  }

  private handleEpoch(frame: TerminalMultiplexFrame): void {
    const record = decodeTerminalMultiplexEpochRecord(frame.payload)
    if (
      this.phase !== 'offer' ||
      frame.routeId !== 0 ||
      frame.seq !== 0n ||
      frame.correlationId !== 0 ||
      !record ||
      record.phase !== 1 ||
      record.protocolMinor !== 0 ||
      record.maxFrameBytes !== TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES ||
      record.maxStreams !== MAX_STREAMS ||
      record.heartbeatMs !== HEARTBEAT_MS
    ) {
      this.protocolClose(1002, 'invalid epoch accept')
      return
    }
    if (!this.context.activateTerminalMultiplexEpoch?.()) {
      this.protocolClose(1008, 'bulk admission expired')
      return
    }
    this.phase = 'heartbeat'
    this.sendHeartbeat(0, this.heartbeatIds.allocate(), terminalMultiplexMonotonicMicros())
    this.heartbeatTimer = setInterval(() => this.heartbeatTick(), HEARTBEAT_MS)
    this.heartbeatTimer.unref?.()
  }

  private handleHeartbeat(frame: TerminalMultiplexFrame): void {
    const record = decodeTerminalMultiplexHeartbeatRecord(frame.payload)
    if (!record || frame.routeId !== 0 || frame.seq !== 0n || frame.correlationId === 0) {
      this.protocolClose(1002, 'invalid heartbeat')
      return
    }
    if (record.phase === 0) {
      this.sendHeartbeat(1, frame.correlationId, record.monotonicMicros)
    } else if (this.pendingHeartbeats.get(frame.correlationId) !== record.monotonicMicros) {
      this.protocolClose(1002, 'invalid heartbeat pong')
      return
    } else {
      this.pendingHeartbeats.delete(frame.correlationId)
    }
    if (this.phase === 'heartbeat') {
      this.phase = 'ready'
      this.emit({ type: 'ready' })
    }
  }

  private handleSubscribe(frame: TerminalMultiplexFrame): void {
    const record = decodeTerminalMultiplexSubscribe(frame.payload)
    // Why: maxStreams limits concurrent work, not lifetime churn. A long-lived
    // connection keeps stream ids monotonic without exhausting after 1,024 closes.
    if (
      frame.routeId < 1 ||
      frame.routeId > 0x7fffffff ||
      frame.correlationId === 0 ||
      !record ||
      this.streams.size >= MAX_STREAMS ||
      frame.routeId <= this.lastStreamId
    ) {
      this.sendError(frame.routeId, frame.correlationId, 'invalid_payload', true)
      return
    }
    this.lastStreamId = frame.routeId
    const stream = TerminalMultiplexStream.open({
      runtime: this.context.runtime,
      routeId: frame.routeId,
      epoch: this.epoch,
      connectionId: this.connectionId,
      subscribeCorrelationId: frame.correlationId,
      record,
      send: (opcode, routeId, seq, correlationId, payload) =>
        this.sender.send(opcode, routeId, seq, correlationId, payload),
      allocateSnapshotId: () => this.snapshotIds.allocate(),
      connectionInFlightBytes: () => this.connectionInFlightBytes,
      connectionQueueBytes: () => this.context.terminalMultiplexQueueBytes?.() ?? 0,
      noteConnectionSent: (bytes) => {
        this.connectionInFlightBytes += bytes
      },
      noteConnectionAck: (bytes) => {
        this.connectionInFlightBytes = Math.max(0, this.connectionInFlightBytes - bytes)
      },
      onClose: (routeId) => {
        this.streams.delete(routeId)
      },
      telemetry: this.telemetry.openStream(frame.routeId)
    })
    if (!stream) {
      return
    }
    if (this.phase === 'closed') {
      stream.dispose()
      return
    }
    // Why: activation emits Subscribed and snapshot frames. Register first so
    // immediate Credit/ACK/control replies cannot race into unknown_stream.
    this.streams.set(frame.routeId, stream)
    void stream.activate().then((activated) => {
      if (!activated && this.streams.get(frame.routeId) === stream) {
        this.streams.delete(frame.routeId)
      }
    })
  }

  private sendHeartbeat(phase: 0 | 1, correlationId: number, micros: bigint): void {
    if (phase === 0) {
      this.pendingHeartbeats.set(correlationId, micros)
    }
    this.sender.send(
      TerminalMultiplexOpcode.Heartbeat,
      0,
      0n,
      correlationId,
      encodeTerminalMultiplexHeartbeatRecord({
        phase,
        appState: 2,
        senderQueueBytes: 0,
        monotonicMicros: micros
      })
    )
  }

  private sendError(routeId: number, correlationId: number, code: string, fatal: boolean): void {
    this.sender.send(
      TerminalMultiplexOpcode.Error,
      routeId,
      0n,
      correlationId,
      encodeTerminalMultiplexJson({ code, message: code, fatal, retryable: !fatal })
    )
  }

  private heartbeatTick(): void {
    const idleMs = Date.now() - this.lastAuthenticatedFrameAt
    if (idleMs >= HEARTBEAT_MS * 2) {
      this.protocolClose(1001, 'heartbeat timeout')
      return
    }
    if (idleMs >= HEARTBEAT_MS) {
      this.sendHeartbeat(0, this.heartbeatIds.allocate(), terminalMultiplexMonotonicMicros())
    }
  }

  private protocolClose(code: number, reason: string): void {
    this.telemetry.noteConnectionEvent(reason)
    this.context.closeTerminalMultiplexConnection?.(code, reason)
    this.close()
  }

  private close(): void {
    if (this.phase === 'closed') {
      return
    }
    this.phase = 'closed'
    this.sender.close()
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }
    this.streams.forEach((stream) => stream.dispose())
    this.streams.clear()
    this.unregisterBinary()
    this.removeAbort()
    this.telemetry.close()
    this.resolveClosed()
  }
}
