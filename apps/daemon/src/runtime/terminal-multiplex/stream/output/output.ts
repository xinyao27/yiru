import type {
  TerminalMultiplexAckRecord,
  TerminalMultiplexCreditRecord
} from '@yiru/runtime-protocol/terminal-multiplex/flow-records'
import type { TerminalChunk } from '~main/agents/provider-runtime/types'
import type { TerminalMultiplexStreamTelemetry } from '~main/runtime/terminal-multiplex/telemetry'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import { splitTerminalMultiplexOutput, type TerminalMultiplexPendingOutput } from './chunks'
import { TerminalMultiplexOutputFlow } from './flow-control'
import {
  createTerminalMultiplexStallMonitor,
  type TerminalMultiplexStallMonitor
} from './stall-monitor'

const OUTPUT_TARGET_BYTES = 32 * 1024
const OUTPUT_FLUSH_MS = 2
const OUTPUT_TRANSPORT_RETRY_MS = 25
const OUTPUT_HARD_PENDING_BYTES = 8 * 1024 * 1024

type TerminalMultiplexOutputOptions = {
  ptyId: string
  runtime: YiruRuntimeService
  connectionInFlightBytes: () => number
  connectionQueueBytes: () => number
  noteConnectionSent: (bytes: number) => void
  noteConnectionAck: (bytes: number) => void
  sendOutput: (payload: Uint8Array, endSeq: bigint) => boolean
  sendAdaptiveCredit: (windowBytes: number) => void
  recover: (reason: 'ack-stall' | 'pending-cap') => void
  streamKey: string
  participatesInPressure: () => boolean
  telemetry: TerminalMultiplexStreamTelemetry
}

export class TerminalMultiplexStreamOutput {
  private readonly options: TerminalMultiplexOutputOptions
  private readonly flow = new TerminalMultiplexOutputFlow()
  private readonly pending: TerminalMultiplexPendingOutput[] = []
  private pendingBytes = 0
  private publishedCreditBytes = 0
  private isGated = false
  private isSnapshotting = true
  private drainedCallback: (() => void) | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly stallMonitor: TerminalMultiplexStallMonitor

  constructor(options: TerminalMultiplexOutputOptions) {
    this.options = options
    this.stallMonitor = createTerminalMultiplexStallMonitor({
      hasInFlightOutput: () => this.flow.inFlightBytes > 0,
      isStalled: () => this.flow.isStalled(),
      onStall: () => {
        this.options.telemetry.noteAckStall()
        this.publishedCreditBytes = 0
        this.options.recover('ack-stall')
      }
    })
  }

  get hasInFlightOutput(): boolean {
    return this.flow.inFlightBytes > 0
  }

  get snapshotPendingDeliveryStartSeq(): bigint | null {
    return this.flow.earliestInFlightSeq
  }

  get isCreditBlocked(): boolean {
    return (
      this.publishedCreditBytes === 0 ||
      this.flow.inFlightBytes >= Math.min(this.publishedCreditBytes, this.flow.currentWindowBytes)
    )
  }

  get deliveryGated(): boolean {
    return this.isGated
  }

  whenDrained(callback: () => void): void {
    this.drainedCallback = callback
    this.publishDrained()
  }

  enqueue(chunk: TerminalChunk, meta?: { wireByteSeq?: bigint }): void {
    const payload = chunk.bytes
    if (payload.byteLength === 0) {
      return
    }
    const endSeq =
      meta?.wireByteSeq ?? this.options.runtime.getTerminalWireByteSequence(this.options.ptyId)
    const startSeq = endSeq - BigInt(payload.byteLength)
    this.pending.push(
      ...splitTerminalMultiplexOutput(payload, startSeq, endSeq, OUTPUT_TARGET_BYTES)
    )
    this.pendingBytes += payload.byteLength
    if (this.pendingBytes > this.unsentCapBytes()) {
      this.pending.splice(0)
      this.pendingBytes = 0
      this.options.telemetry.noteGap()
      this.options.recover('pending-cap')
      return
    }
    this.refreshPressure()
    if (this.pendingBytes >= OUTPUT_TARGET_BYTES) {
      this.flush()
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), OUTPUT_FLUSH_MS)
      this.flushTimer.unref?.()
    }
  }

  applyCredit(record: TerminalMultiplexCreditRecord): void {
    if (record.direction !== 0) {
      return
    }
    this.publishedCreditBytes = record.maxInFlightBytes
    this.flush()
  }

  acknowledge(record: TerminalMultiplexAckRecord): boolean {
    if (record.kind !== 0 || record.status !== 0) {
      return false
    }
    const update = this.flow.acknowledge(record.cumulativeSeq, record.receiverQueueBytes)
    this.options.noteConnectionAck(update.acknowledgedBytes)
    if (update.windowChanged) {
      this.options.sendAdaptiveCredit(update.windowBytes)
    }
    if (this.flow.inFlightBytes === 0) {
      this.stallMonitor.clear()
    } else {
      this.stallMonitor.schedule()
    }
    this.flush()
    this.publishDrained()
    return true
  }

  gate(gated: boolean): void {
    this.isGated = gated
    if (gated) {
      if (this.pendingBytes > 0) {
        this.options.telemetry.noteHiddenDrop()
      }
      this.pending.splice(0)
      this.pendingBytes = 0
    }
    this.refreshPressure()
    if (!gated) {
      this.flush()
    }
  }

  beginSnapshot(): void {
    this.isSnapshotting = true
  }

  completeSnapshot(coverageEndSeq: bigint): void {
    this.isSnapshotting = false
    this.options.noteConnectionAck(this.flow.inFlightBytes)
    this.flow.rebase(coverageEndSeq)
    this.stallMonitor.clear()
    this.discardCovered(coverageEndSeq)
    this.flush()
  }

  completeManualSnapshot(): void {
    this.isSnapshotting = false
    this.flush()
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }
    this.stallMonitor.clear()
    this.options.runtime.reportTerminalMultiplexPressure(
      this.options.ptyId,
      this.options.streamKey,
      null
    )
    this.options.noteConnectionAck(this.flow.inFlightBytes)
    this.pending.splice(0)
    this.pendingBytes = 0
    this.drainedCallback = null
  }

  private flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.isGated || this.isSnapshotting || this.publishedCreditBytes === 0) {
      return
    }
    let turns = 0
    let transportBlocked = false
    while (this.pending.length > 0 && turns < 2) {
      const aggregate = this.takeAggregate()
      const allowedWindow = Math.min(this.publishedCreditBytes, this.flow.currentWindowBytes)
      if (
        this.flow.inFlightBytes + aggregate.payload.byteLength > allowedWindow ||
        !this.flow.canSend(aggregate.payload.byteLength, this.options.connectionInFlightBytes())
      ) {
        this.pending.unshift(aggregate)
        this.pendingBytes += aggregate.payload.byteLength
        break
      }
      if (!this.options.sendOutput(aggregate.payload, aggregate.endSeq)) {
        this.pending.unshift(aggregate)
        this.pendingBytes += aggregate.payload.byteLength
        transportBlocked = true
        break
      }
      this.flow.noteSent(aggregate.startSeq, aggregate.endSeq)
      this.stallMonitor.schedule()
      this.options.noteConnectionSent(aggregate.payload.byteLength)
      turns += 1
    }
    this.refreshPressure()
    if (this.pending.length > 0 && turns > 0) {
      queueMicrotask(() => this.flush())
    } else if (transportBlocked && !this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), OUTPUT_TRANSPORT_RETRY_MS)
      this.flushTimer.unref?.()
    }
    this.publishDrained()
  }

  private takeAggregate(): TerminalMultiplexPendingOutput {
    const selected: TerminalMultiplexPendingOutput[] = []
    let bytes = 0
    while (this.pending[0] && bytes + this.pending[0]!.payload.byteLength <= OUTPUT_TARGET_BYTES) {
      const next = this.pending.shift()!
      if (selected[0] && selected.at(-1)!.endSeq !== next.startSeq) {
        this.pending.unshift(next)
        break
      }
      selected.push(next)
      bytes += next.payload.byteLength
      this.pendingBytes -= next.payload.byteLength
    }
    if (selected.length === 0) {
      const next = this.pending.shift()!
      this.pendingBytes -= next.payload.byteLength
      return next
    }
    if (selected.length === 1) {
      return selected[0]!
    }
    const payload = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of selected) {
      payload.set(chunk.payload, offset)
      offset += chunk.payload.byteLength
    }
    return {
      payload,
      startSeq: selected[0]!.startSeq,
      endSeq: selected.at(-1)!.endSeq
    }
  }

  private discardCovered(coverageEndSeq: bigint): void {
    const retained: TerminalMultiplexPendingOutput[] = []
    for (const chunk of this.pending) {
      if (chunk.endSeq <= coverageEndSeq) {
        continue
      }
      if (chunk.startSeq < coverageEndSeq) {
        const offset = Number(coverageEndSeq - chunk.startSeq)
        retained.push({
          payload: chunk.payload.slice(offset),
          startSeq: coverageEndSeq,
          endSeq: chunk.endSeq
        })
      } else {
        retained.push(chunk)
      }
    }
    this.pending.splice(0, this.pending.length, ...retained)
    this.pendingBytes = retained.reduce((total, chunk) => total + chunk.payload.byteLength, 0)
  }

  refreshPressure(): void {
    const unsentCapBytes = this.unsentCapBytes()
    this.flow.noteSocketQueue(this.options.connectionQueueBytes())
    const flow = this.flow.telemetry
    this.options.telemetry.observeFlow({
      creditBytes: this.publishedCreditBytes,
      inFlightBytes: flow.inFlightBytes,
      unsentBytes: this.pendingBytes,
      receiverQueueBytes: flow.receiverQueueBytes,
      socketQueueBytes: flow.socketQueueBytes,
      rttMs: flow.rttMs,
      deliveryRateBytesPerMs: flow.deliveryRateBytesPerMs,
      isProducerPaused: this.isCreditBlocked
    })
    this.options.runtime.reportTerminalMultiplexPressure(
      this.options.ptyId,
      this.options.streamKey,
      {
        participates: this.options.participatesInPressure(),
        blocked: this.isCreditBlocked,
        pendingRatio: this.pendingBytes / unsentCapBytes
      }
    )
  }

  private unsentCapBytes(): number {
    return Math.min(OUTPUT_HARD_PENDING_BYTES, Math.max(1024 * 1024, this.flow.currentWindowBytes))
  }

  private publishDrained(): void {
    if (this.pendingBytes !== 0 || this.flow.inFlightBytes !== 0) {
      return
    }
    const callback = this.drainedCallback
    this.drainedCallback = null
    callback?.()
  }
}
