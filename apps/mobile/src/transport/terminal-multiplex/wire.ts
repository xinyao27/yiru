import {
  decodeTerminalMultiplexEpochRecord,
  decodeTerminalMultiplexHeartbeatRecord,
  encodeTerminalMultiplexEpochRecord,
  encodeTerminalMultiplexHeartbeatRecord
} from '@yiru/runtime-protocol/terminal-multiplex/connection-records'
import {
  decodeTerminalMultiplexFrame,
  encodeTerminalMultiplexFrame,
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@yiru/runtime-protocol/terminal-multiplex/frame'

type MobileTerminalWireOptions = {
  sendBytes: (bytes: Uint8Array<ArrayBufferLike>) => boolean
  allocateCorrelationId: () => number
  getAppState: () => 0 | 1
  getSenderQueueBytes: () => number
  onStreamFrame: (frame: TerminalMultiplexFrame) => void
  onAccepted: () => void
  onError: (error: Error) => void
}

export class MobileTerminalMultiplexWire {
  private readonly options: MobileTerminalWireOptions
  private epoch = 0n
  private isAccepted = false
  private lastAuthenticatedFrameAt = 0
  private heartbeatMs = 15_000
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private readonly pendingHeartbeats = new Map<number, bigint>()
  private initialHeartbeatId: number | null = null

  constructor(options: MobileTerminalWireOptions) {
    this.options = options
  }

  get accepted(): boolean {
    return this.isAccepted
  }

  get isFresh(): boolean {
    return Date.now() - this.lastAuthenticatedFrameAt <= this.heartbeatMs
  }

  handle(bytes: Uint8Array<ArrayBufferLike>, maxFrameBytes: number): void {
    const decoded = decodeTerminalMultiplexFrame(bytes, maxFrameBytes)
    if (!decoded.ok) {
      this.options.onError(new Error(`Invalid terminal multiplex frame: ${decoded.error.code}`))
      return
    }
    this.lastAuthenticatedFrameAt = Date.now()
    const frame = decoded.frame
    if (frame.opcode === TerminalMultiplexOpcode.Epoch) {
      this.handleEpoch(frame)
      return
    }
    if (this.epoch === 0n || frame.epoch !== this.epoch) {
      this.options.onError(new Error('Mobile terminal epoch mismatch.'))
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.Heartbeat) {
      this.handleHeartbeat(frame)
      return
    }
    if (!this.isAccepted) {
      this.options.onError(new Error('Mobile terminal frame arrived before epoch acceptance.'))
      return
    }
    this.options.onStreamFrame(frame)
  }

  send(
    opcode: TerminalMultiplexOpcodeValue,
    routeId: number,
    seq: bigint,
    correlationId: number,
    payload: Uint8Array<ArrayBufferLike> = new Uint8Array()
  ): boolean {
    if (this.epoch === 0n) {
      return false
    }
    try {
      return this.options.sendBytes(
        encodeTerminalMultiplexFrame({
          opcode,
          routeId,
          epoch: this.epoch,
          seq,
          correlationId,
          payload
        })
      )
    } catch {
      return false
    }
  }

  reset(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }
    this.heartbeatTimer = null
    this.epoch = 0n
    this.isAccepted = false
    this.lastAuthenticatedFrameAt = 0
    this.pendingHeartbeats.clear()
    this.initialHeartbeatId = null
  }

  private handleEpoch(frame: TerminalMultiplexFrame): void {
    const record = decodeTerminalMultiplexEpochRecord(frame.payload)
    if (!record || record.phase !== 0 || frame.epoch === 0n || this.epoch !== 0n) {
      this.options.onError(new Error('Mobile terminal epoch offer is invalid.'))
      return
    }
    this.epoch = frame.epoch
    this.heartbeatMs = Math.max(1_000, record.heartbeatMs)
    if (
      !this.send(
        TerminalMultiplexOpcode.Epoch,
        0,
        0n,
        0,
        encodeTerminalMultiplexEpochRecord({ ...record, phase: 1 })
      )
    ) {
      this.options.onError(new Error('Mobile terminal epoch accept was not writable.'))
      return
    }
    const correlationId = this.options.allocateCorrelationId()
    this.initialHeartbeatId = correlationId
    this.sendHeartbeat(0, correlationId, monotonicMicros())
    this.heartbeatTimer = setInterval(() => this.heartbeatTick(), this.heartbeatMs)
  }

  private handleHeartbeat(frame: TerminalMultiplexFrame): void {
    const record = decodeTerminalMultiplexHeartbeatRecord(frame.payload)
    if (!record || frame.routeId !== 0 || frame.seq !== 0n || frame.correlationId === 0) {
      this.options.onError(new Error('Mobile terminal heartbeat is invalid.'))
      return
    }
    if (record.phase === 0) {
      this.sendHeartbeat(1, frame.correlationId, record.monotonicMicros)
      return
    }
    if (this.pendingHeartbeats.get(frame.correlationId) !== record.monotonicMicros) {
      this.options.onError(new Error('Mobile terminal heartbeat pong is invalid.'))
      return
    }
    this.pendingHeartbeats.delete(frame.correlationId)
    if (frame.correlationId === this.initialHeartbeatId) {
      this.initialHeartbeatId = null
      this.isAccepted = true
      this.options.onAccepted()
    }
  }

  private heartbeatTick(): void {
    const idleMs = Date.now() - this.lastAuthenticatedFrameAt
    if (idleMs >= this.heartbeatMs * 2) {
      this.options.onError(new Error('Mobile terminal heartbeat timed out.'))
    } else if (idleMs >= this.heartbeatMs) {
      this.sendHeartbeat(0, this.options.allocateCorrelationId(), monotonicMicros())
    }
  }

  private sendHeartbeat(phase: 0 | 1, correlationId: number, micros: bigint): void {
    if (phase === 0) {
      this.pendingHeartbeats.set(correlationId, micros)
    }
    this.send(
      TerminalMultiplexOpcode.Heartbeat,
      0,
      0n,
      correlationId,
      encodeTerminalMultiplexHeartbeatRecord({
        phase,
        appState: this.options.getAppState(),
        senderQueueBytes: this.options.getSenderQueueBytes(),
        monotonicMicros: micros
      })
    )
  }
}

function monotonicMicros(): bigint {
  return BigInt(Math.floor(performance.now() * 1_000))
}
