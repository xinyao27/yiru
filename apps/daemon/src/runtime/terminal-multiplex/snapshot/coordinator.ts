import { TerminalMultiplexErrorCode } from '@yiru/runtime-protocol/terminal-multiplex/error-codes'
import type { TerminalMultiplexAckRecord } from '@yiru/runtime-protocol/terminal-multiplex/flow-records'
import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { encodeTerminalMultiplexJson } from '@yiru/runtime-protocol/terminal-multiplex/json'
import {
  createTerminalMultiplexRecoveryState,
  reduceRecovery,
  type TerminalMultiplexRecoveryEffect,
  type TerminalMultiplexRecoveryEvent,
  type TerminalMultiplexRecoveryState
} from '@yiru/runtime-protocol/terminal-multiplex/recovery'
import {
  encodeTerminalMultiplexSnapshotEndRecord,
  type TerminalMultiplexSnapshotReason
} from '@yiru/runtime-protocol/terminal-multiplex/snapshot-records'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import type { TerminalMultiplexStreamOutput } from '../stream/output/output'
import type { TerminalMultiplexStreamTelemetry } from '../telemetry'
import { sendTerminalMultiplexSnapshot } from './sender'

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
  deliveryActive: boolean
  telemetry: TerminalMultiplexStreamTelemetry
}

type SnapshotStartOverrides = {
  id: number
  rows?: number
  maxBytes?: number
}

export class TerminalMultiplexSnapshotCoordinator {
  private readonly options: TerminalMultiplexSnapshotCoordinatorOptions
  private recovery: TerminalMultiplexRecoveryState
  private generation = 0

  constructor(options: TerminalMultiplexSnapshotCoordinatorOptions) {
    this.options = options
    this.recovery = createTerminalMultiplexRecoveryState(
      options.deliveryActive ? 'active' : 'gated'
    )
  }

  get isActive(): boolean {
    return this.recovery.memory.activeSnapshot !== null
  }

  get phase(): TerminalMultiplexRecoveryState['kind'] {
    return this.recovery.kind
  }

  acknowledge(frame: TerminalMultiplexFrame, record: TerminalMultiplexAckRecord): boolean {
    if (record.kind !== 2) {
      return false
    }
    const effects = this.reduce({
      type: 'host-snapshot-ack',
      id: frame.correlationId,
      coverageEndSeq: frame.seq
    })
    this.executeEffects(effects)
    return effects.some((effect) => effect.type === 'host-snapshot-ack-result' && effect.accepted)
  }

  request(
    snapshotId: number,
    request: { requestedScrollbackRows: number; snapshotMaxBytes: number | null },
    seq: bigint
  ): void {
    const effects = this.reduce({ type: 'host-manual-request', id: snapshotId, seq })
    this.executeEffects(effects, {
      id: snapshotId,
      rows: request.requestedScrollbackRows,
      maxBytes: request.snapshotMaxBytes ?? undefined
    })
  }

  recover(reason: 'ack-stall' | 'pending-cap' | 'provider-gap'): void {
    const snapshotId =
      this.recovery.memory.delivery === 'active' ? this.options.allocateSnapshotId() : undefined
    const effects = this.reduce({
      type: 'host-recover',
      cause: reason,
      ...(snapshotId === undefined ? {} : { snapshotId })
    })
    this.executeEffects(effects)
  }

  setDeliveryGated(gated: boolean): void {
    this.executeEffects(this.reduce({ type: gated ? 'delivery-gated' : 'delivery-active' }))
  }

  dispose(): void {
    this.generation += 1
    this.recovery = createTerminalMultiplexRecoveryState(
      this.recovery.memory.delivery === 'active' ? 'active' : 'gated'
    )
  }

  async start(
    reason: TerminalMultiplexSnapshotReason,
    snapshotId: number,
    rows?: number,
    maxBytes = this.options.maxBytes
  ): Promise<void> {
    const effects = this.reduce({ type: 'host-start', id: snapshotId, reason })
    await Promise.all(
      this.executeEffects(effects, { id: snapshotId, rows, maxBytes }).filter(
        (result): result is Promise<void> => result !== undefined
      )
    )
  }

  private reduce(
    event: TerminalMultiplexRecoveryEvent
  ): readonly TerminalMultiplexRecoveryEffect[] {
    const transition = reduceRecovery(this.recovery, event)
    this.recovery = transition.state
    return transition.effects
  }

  private executeEffects(
    effects: readonly TerminalMultiplexRecoveryEffect[],
    overrides?: SnapshotStartOverrides
  ): readonly (Promise<void> | undefined)[] {
    return effects.map((effect) => {
      switch (effect.type) {
        case 'start-host-snapshot':
          return this.sendSnapshot(
            effect.id,
            effect.reason,
            overrides?.id === effect.id ? overrides.rows : undefined,
            overrides?.id === effect.id ? overrides.maxBytes : undefined
          )
        case 'send-superseded-snapshot':
          this.sendSuperseded(effect.id, effect.coverageEndSeq)
          return undefined
        case 'complete-host-snapshot':
          this.options.output.completeSnapshot(effect.coverageEndSeq)
          return undefined
        case 'complete-host-manual-snapshot':
          this.options.output.completeManualSnapshot()
          return undefined
        case 'reject-manual-snapshot':
          this.options.sendControlAck(effect.id, {
            status: 2,
            errorCode: TerminalMultiplexErrorCode.snapshot_busy,
            seq: effect.seq
          })
          return undefined
        case 'send-model-restore':
          this.sendModelRestore(effect.cause, effect.snapshotFollows)
          return undefined
        case 'host-snapshot-ack-result':
          return undefined
        case 'clear-client-snapshot':
        case 'set-output-credit':
        case 'request-client-snapshot':
          throw new Error('Client recovery effect reached the terminal host')
      }
    })
  }

  private async sendSnapshot(
    snapshotId: number,
    reason: TerminalMultiplexSnapshotReason,
    rows?: number,
    maxBytes = this.options.maxBytes
  ): Promise<void> {
    const generation = ++this.generation
    const pendingDeliveryStartSeq =
      this.options.output.snapshotPendingDeliveryStartSeq ??
      this.options.runtime.getTerminalWireByteSequence(this.options.ptyId)
    this.options.output.beginSnapshot()
    if (reason === 'reveal') {
      this.options.output.gate(false)
    }
    const startedAt = performance.now()
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
    this.executeEffects(
      this.reduce({
        type: 'host-snapshot-sent',
        coverageEndSeq: sent.coverageEndSeq,
        status: sent.status
      })
    )
  }

  private sendModelRestore(
    reason: 'ack-stall' | 'pending-cap' | 'provider-gap',
    snapshotFollows: boolean
  ): void {
    const seq = this.options.runtime.getTerminalWireByteSequence(this.options.ptyId)
    this.options.send(
      TerminalMultiplexOpcode.ModelRestore,
      seq,
      0,
      encodeTerminalMultiplexJson({
        reason,
        markerSeq: seq.toString(),
        snapshotFollows
      })
    )
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
