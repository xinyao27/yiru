import { encodeTerminalMultiplexAckRecord } from '@yiru/runtime-protocol/terminal-multiplex/flow-records'
import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { decodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'
import { decodeTerminalMultiplexSnapshotEndRecord } from '@yiru/runtime-protocol/terminal-multiplex/snapshot-records'

import { MobileTerminalOrderedEvents } from './ordered-events'
import { MobileTerminalSnapshotAssembler } from './snapshot'
import type { MobileTerminalCallbacks, MobileTerminalSnapshot } from './types'

type SendFrame = (
  opcode: TerminalMultiplexOpcodeValue,
  routeId: number,
  seq: bigint,
  correlationId: number,
  payload?: Uint8Array<ArrayBufferLike>
) => boolean

type PendingOutput = {
  payload: Uint8Array<ArrayBufferLike>
  startSeq: bigint
  endSeq: bigint
}

type MobileTerminalDeliveryOptions = {
  routeId: number
  callbacks: MobileTerminalCallbacks
  send: SendFrame
  allocateCorrelationId: () => number
  setCredit: (bytes: number, reason?: 0 | 1 | 2 | 3) => boolean
  getAckEveryBytes: () => number
  onEnd: () => void
}

export class MobileTerminalDelivery {
  private readonly options: MobileTerminalDeliveryOptions
  private readonly assembler = new MobileTerminalSnapshotAssembler()
  private readonly pendingOutput: PendingOutput[] = []
  private readonly orderedEvents: MobileTerminalOrderedEvents
  private parsedSequence = 0n
  private expectedSequence = 0n
  private snapshotting = true
  private recoveryRequested = false
  private initialSnapshotId = 0
  private awaitingSnapshot: MobileTerminalSnapshot | null = null
  private pendingEndSequence: bigint | null = null

  constructor(options: MobileTerminalDeliveryOptions) {
    this.options = options
    this.orderedEvents = new MobileTerminalOrderedEvents(options.callbacks)
  }

  get parsedSeq(): bigint {
    return this.parsedSequence
  }

  beginInitialSnapshot(snapshotId: number): void {
    this.initialSnapshotId = snapshotId
    this.snapshotting = true
    this.options.setCredit(0)
  }

  beginReveal(): void {
    this.snapshotting = true
    this.options.setCredit(0)
  }

  handle(frame: TerminalMultiplexFrame): boolean {
    if (this.orderedEvents.handle(frame)) {
      return true
    }
    switch (frame.opcode) {
      case TerminalMultiplexOpcode.Output:
        this.handleOutput(frame)
        return true
      case TerminalMultiplexOpcode.SnapshotStart:
        this.snapshotting = this.assembler.start(frame)
        this.recoveryRequested = false
        if (!this.snapshotting) {
          this.recover('invalid snapshot start')
        }
        return true
      case TerminalMultiplexOpcode.SnapshotChunk:
        if (!this.assembler.chunk(frame)) {
          this.recover('snapshot chunk mismatch')
        }
        return true
      case TerminalMultiplexOpcode.SnapshotEnd:
        this.handleSnapshotEnd(frame)
        return true
      case TerminalMultiplexOpcode.End:
        this.pendingEndSequence = frame.seq
        this.publishEndIfParsed()
        return true
      case TerminalMultiplexOpcode.ModelRestore:
        this.handleModelRestore(frame)
        return true
      case TerminalMultiplexOpcode.Epoch:
      case TerminalMultiplexOpcode.Heartbeat:
      case TerminalMultiplexOpcode.Subscribe:
      case TerminalMultiplexOpcode.Subscribed:
      case TerminalMultiplexOpcode.Unsubscribe:
      case TerminalMultiplexOpcode.Error:
      case TerminalMultiplexOpcode.Ack:
      case TerminalMultiplexOpcode.Credit:
      case TerminalMultiplexOpcode.Input:
      case TerminalMultiplexOpcode.Resize:
      case TerminalMultiplexOpcode.Resized:
      case TerminalMultiplexOpcode.ClaimViewport:
      case TerminalMultiplexOpcode.SnapshotRequest:
      case TerminalMultiplexOpcode.VisibilityGate:
      case TerminalMultiplexOpcode.RevealSnapshot:
      case TerminalMultiplexOpcode.Signal:
      case TerminalMultiplexOpcode.Kill:
      case TerminalMultiplexOpcode.FitOverride:
      case TerminalMultiplexOpcode.Driver:
        return false
    }
    return false
  }

  outputParsed(endSeqText: string, receiverQueueBytes = 0): void {
    let endSeq: bigint
    try {
      endSeq = BigInt(endSeqText)
    } catch {
      this.recover('invalid renderer parse sequence')
      return
    }
    if (endSeq <= this.parsedSequence || endSeq > this.expectedSequence) {
      this.recover('renderer parse sequence is outside the delivery window')
      return
    }
    const acknowledgedBytes = endSeq - this.parsedSequence
    if (acknowledgedBytes > 0xffffffffn) {
      this.recover('renderer parse acknowledgement is too large')
      return
    }
    this.parsedSequence = endSeq
    this.orderedEvents.publishThrough(this.parsedSequence)
    this.sendAck(0, 0, endSeq, Number(acknowledgedBytes), receiverQueueBytes)
    this.publishEndIfParsed()
  }

  snapshotParsed(snapshotId: number): void {
    const snapshot = this.awaitingSnapshot
    if (!snapshot || snapshot.id !== snapshotId) {
      this.recover('renderer acknowledged an unknown snapshot')
      return
    }
    const coverageEndSeq = BigInt(snapshot.coverageEndSeq)
    this.awaitingSnapshot = null
    this.parsedSequence = coverageEndSeq
    this.expectedSequence = coverageEndSeq
    this.orderedEvents.publishThrough(this.parsedSequence)
    this.sendAck(2, snapshot.id, coverageEndSeq, 0, 0)
    this.snapshotting = false
    this.options.setCredit(1024 * 1024)
    for (const output of this.pendingOutput.splice(0)) {
      const pendingStart = BigInt(snapshot.pendingDeliveryStartSeq)
      if (output.endSeq > pendingStart && output.endSeq <= coverageEndSeq) {
        continue
      }
      if (output.endSeq <= pendingStart) {
        this.recover('output predates snapshot delivery window')
        return
      }
      this.deliverOutput(output)
    }
    if (snapshot.id === this.initialSnapshotId) {
      this.options.callbacks.onSubscribed?.()
    }
  }

  prepareForNewEpoch(): void {
    this.snapshotting = true
    this.assembler.clear()
    this.pendingOutput.splice(0)
    this.awaitingSnapshot = null
    this.recoveryRequested = false
    this.expectedSequence = this.parsedSequence
    this.orderedEvents.clear()
  }

  private handleOutput(frame: TerminalMultiplexFrame): void {
    const startSeq = frame.seq - BigInt(frame.payload.byteLength)
    if (startSeq < 0n) {
      this.recover('invalid output sequence')
      return
    }
    const output = { payload: frame.payload, startSeq, endSeq: frame.seq }
    if (this.snapshotting) {
      this.pendingOutput.push(output)
    } else {
      this.deliverOutput(output)
    }
  }

  private deliverOutput(output: PendingOutput): void {
    if (output.endSeq <= this.expectedSequence) {
      return
    }
    let payload = output.payload
    let startSeq = output.startSeq
    if (startSeq < this.expectedSequence) {
      payload = payload.slice(Number(this.expectedSequence - startSeq))
      startSeq = this.expectedSequence
    }
    if (startSeq !== this.expectedSequence) {
      this.recover('output sequence gap')
      return
    }
    try {
      const data = new TextDecoder('utf-8', { fatal: true }).decode(payload)
      this.expectedSequence = output.endSeq
      this.options.callbacks.onData(data, {
        endSeq: output.endSeq.toString(),
        wireByteLength: payload.byteLength,
        ackEveryBytes: this.options.getAckEveryBytes()
      })
    } catch {
      this.options.callbacks.onError?.('Mobile terminal output is not valid UTF-8.')
      this.recover('invalid output UTF-8')
    }
  }

  private handleSnapshotEnd(frame: TerminalMultiplexFrame): void {
    const end = decodeTerminalMultiplexSnapshotEndRecord(frame.payload)
    if (!end || end.snapshotId !== frame.correlationId || end.coverageEndSeq !== frame.seq) {
      this.recover('invalid snapshot end')
      return
    }
    if (end.status !== 0) {
      this.assembler.clear()
      this.options.callbacks.onError?.(
        end.status === 2
          ? 'Mobile terminal snapshot exceeded the 2 MiB replay limit.'
          : 'Mobile terminal snapshot is unavailable.'
      )
      return
    }
    const snapshot = this.assembler.end(frame)
    if (!snapshot) {
      this.recover('invalid snapshot')
      return
    }
    this.awaitingSnapshot = snapshot
    this.options.callbacks.onSnapshot(snapshot)
  }

  private handleModelRestore(frame: TerminalMultiplexFrame): void {
    const value = decodeTerminalMultiplexJson(frame.payload)
    if (!value || typeof value.snapshotFollows !== 'boolean') {
      this.recover('invalid model restore record')
      return
    }
    this.snapshotting = true
    this.recoveryRequested = value.snapshotFollows
    this.awaitingSnapshot = null
    this.assembler.clear()
    this.options.setCredit(0)
  }

  private recover(_reason: string): void {
    if (this.recoveryRequested) {
      return
    }
    this.recoveryRequested = true
    this.snapshotting = true
    this.awaitingSnapshot = null
    this.assembler.clear()
    this.options.setCredit(0)
    this.options.send(
      TerminalMultiplexOpcode.SnapshotRequest,
      this.options.routeId,
      this.parsedSequence,
      this.options.allocateCorrelationId(),
      new TextEncoder().encode(JSON.stringify({ requestedScrollbackRows: 1_000 }))
    )
  }

  private sendAck(
    kind: 0 | 1 | 2 | 3,
    correlationId: number,
    seq: bigint,
    bytes: number,
    receiverQueueBytes: number
  ): void {
    this.options.send(
      TerminalMultiplexOpcode.Ack,
      this.options.routeId,
      seq,
      correlationId,
      encodeTerminalMultiplexAckRecord({
        kind,
        status: 0,
        errorCode: 0,
        acknowledgedBytes: bytes,
        cumulativeSeq: seq,
        receiverQueueBytes: Math.max(0, Math.min(0xffffffff, receiverQueueBytes))
      })
    )
  }

  private publishEndIfParsed(): void {
    if (this.pendingEndSequence !== null && this.parsedSequence >= this.pendingEndSequence) {
      this.pendingEndSequence = null
      this.options.callbacks.onEnd?.()
      this.options.onEnd()
    }
  }
}
