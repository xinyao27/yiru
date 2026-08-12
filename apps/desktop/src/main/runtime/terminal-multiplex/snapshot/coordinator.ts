import { TerminalMultiplexErrorCode } from '@yiru/runtime-protocol/terminal-multiplex/error-codes'
import type { TerminalMultiplexAckRecord } from '@yiru/runtime-protocol/terminal-multiplex/flow-records'
import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { encodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'
import { encodeTerminalMultiplexSnapshotEndRecord } from '@yiru/runtime-protocol/terminal-multiplex/snapshot-records'

import type { YiruRuntimeService } from '../../yiru-runtime'
import type { TerminalMultiplexStreamOutput } from '../stream/output/output'
import type { TerminalMultiplexStreamTelemetry } from '../telemetry'
import { sendTerminalMultiplexSnapshot } from './sender'

export type TerminalMultiplexSnapshotReason = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type TerminalMultiplexSnapshotState = 'snapshotting' | 'live' | 'gated' | 'recovering'

type TerminalMultiplexSnapshotCoordinatorOptions = {
  runtime: YiruRuntimeService
  ptyId: string
  maxBytes: number
  output: TerminalMultiplexStreamOutput
  allocateSnapshotId: () => number
  send: (
    opcode: TerminalMultiplexOpcodeValue,
    seq: bigint,
    correlationId: number,
    payload?: Uint8Array<ArrayBufferLike>
  ) => boolean
  sendControlAck: (
    correlationId: number,
    result: { status: 0 | 1 | 2 | 3; errorCode: number; seq: bigint }
  ) => void
  isDeliveryActive: () => boolean
  onState: (state: TerminalMultiplexSnapshotState) => void
  telemetry: TerminalMultiplexStreamTelemetry
}

type PendingSnapshot = {
  id: number
  coverageEndSeq: bigint
  reason: TerminalMultiplexSnapshotReason
}

export class TerminalMultiplexSnapshotCoordinator {
  private readonly options: TerminalMultiplexSnapshotCoordinatorOptions
  private pending: PendingSnapshot | null = null
  private activeReason: TerminalMultiplexSnapshotReason | null = null
  private generation = 0

  constructor(options: TerminalMultiplexSnapshotCoordinatorOptions) {
    this.options = options
  }

  get isActive(): boolean {
    return this.activeReason !== null
  }

  acknowledge(frame: TerminalMultiplexFrame, record: TerminalMultiplexAckRecord): boolean {
    if (
      record.kind !== 2 ||
      this.pending?.id !== frame.correlationId ||
      this.pending.coverageEndSeq !== frame.seq
    ) {
      return false
    }
    if (this.pending.reason === 1) {
      this.options.output.completeManualSnapshot()
    } else {
      this.options.output.completeSnapshot(frame.seq)
    }
    this.pending = null
    this.activeReason = null
    this.options.onState(this.options.isDeliveryActive() ? 'live' : 'gated')
    return true
  }

  request(
    snapshotId: number,
    request: { requestedScrollbackRows: number; snapshotMaxBytes: number | null },
    seq: bigint
  ): void {
    if (this.activeReason !== null) {
      this.options.sendControlAck(snapshotId, {
        status: 2,
        errorCode: TerminalMultiplexErrorCode.snapshot_busy,
        seq
      })
      return
    }
    void this.start(
      1,
      snapshotId,
      request.requestedScrollbackRows,
      request.snapshotMaxBytes ?? undefined
    )
  }

  recover(reason: 'ack-stall' | 'pending-cap' | 'provider-gap', isGated: boolean): void {
    const seq = this.options.runtime.getTerminalWireByteSequence(this.options.ptyId)
    this.options.send(
      TerminalMultiplexOpcode.ModelRestore,
      seq,
      0,
      encodeTerminalMultiplexJson({
        reason,
        markerSeq: seq.toString(),
        snapshotFollows: !isGated
      })
    )
    if (!isGated) {
      void this.start(reason === 'pending-cap' ? 5 : 2, this.options.allocateSnapshotId())
    }
  }

  dispose(): void {
    this.generation += 1
    this.pending = null
    this.activeReason = null
  }

  async start(
    reason: TerminalMultiplexSnapshotReason,
    snapshotId: number,
    rows?: number,
    maxBytes = this.options.maxBytes
  ): Promise<void> {
    if (
      this.activeReason !== null &&
      snapshotPriority(reason) <= snapshotPriority(this.activeReason)
    ) {
      return
    }
    this.supersedePending()
    this.activeReason = reason
    const generation = ++this.generation
    this.options.onState(reason === 0 ? 'snapshotting' : 'recovering')
    const pendingDeliveryStartSeq =
      this.options.output.snapshotPendingDeliveryStartSeq ??
      this.options.runtime.getTerminalWireByteSequence(this.options.ptyId)
    this.options.output.beginSnapshot()
    const startedAt = performance.now()
    if (reason === 3) {
      this.options.output.gate(false)
    }
    const sent = await sendTerminalMultiplexSnapshot({
      runtime: this.options.runtime,
      ptyId: this.options.ptyId,
      snapshotId,
      reason,
      maxBytes: Math.min(this.options.maxBytes, maxBytes),
      scrollbackRows: rows,
      pendingDeliveryStartSeq,
      isCurrent: () => generation === this.generation,
      send: this.options.send
    })
    this.options.telemetry.noteSnapshot({
      reason,
      sizeBytes: sent.assembledBytes,
      rows: sent.retainedScrollbackRows,
      truncated: sent.truncated,
      durationMs: performance.now() - startedAt,
      status: sent.status
    })
    if (generation !== this.generation) {
      if (sent.status !== 3) {
        this.sendSuperseded(snapshotId, sent.coverageEndSeq)
      }
      return
    }
    if (sent.status !== 0) {
      this.activeReason = null
      if (reason === 1) {
        this.options.output.completeManualSnapshot()
        this.options.onState(this.options.isDeliveryActive() ? 'live' : 'gated')
      }
      return
    }
    this.pending = { id: snapshotId, coverageEndSeq: sent.coverageEndSeq, reason }
  }

  private supersedePending(): void {
    if (!this.pending) {
      return
    }
    this.sendSuperseded(this.pending.id, this.pending.coverageEndSeq)
    this.pending = null
  }

  private sendSuperseded(snapshotId: number, coverageEndSeq: bigint): void {
    this.options.send(
      TerminalMultiplexOpcode.SnapshotEnd,
      coverageEndSeq,
      snapshotId,
      encodeTerminalMultiplexSnapshotEndRecord({
        snapshotId,
        status: 3,
        coverageEndSeq,
        assembledBytes: 0,
        crc32c: 0
      })
    )
  }
}

function snapshotPriority(reason: TerminalMultiplexSnapshotReason): number {
  if (reason === 0) {
    return 5
  }
  if (reason === 2 || reason === 5 || reason === 6) {
    return 4
  }
  if (reason === 3) {
    return 3
  }
  if (reason === 4) {
    return 2
  }
  return 1
}
