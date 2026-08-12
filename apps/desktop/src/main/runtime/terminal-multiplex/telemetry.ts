import { randomBytes } from 'node:crypto'
import { PerformanceObserver } from 'node:perf_hooks'

import type { TerminalMultiplexOpcode } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { startSpan } from '~main/observability/tracer'

const SAMPLE_INTERVAL_MS = 15_000

let cumulativeGcPauseMs = 0
const gcObserver = new PerformanceObserver((entries) => {
  for (const entry of entries.getEntries()) {
    cumulativeGcPauseMs += entry.duration
  }
})
gcObserver.observe({ entryTypes: ['gc'] })

type FlowSample = {
  creditBytes: number
  inFlightBytes: number
  unsentBytes: number
  receiverQueueBytes: number
  socketQueueBytes: number
  rttMs: number | null
  deliveryRateBytesPerMs: number | null
  isProducerPaused: boolean
}

type SnapshotSample = {
  reason: number
  sizeBytes: number
  rows: number
  truncated: boolean
  durationMs: number
  status: number
}

export class TerminalMultiplexTelemetry {
  private readonly lane: string
  private readonly environmentFingerprint = randomFingerprint()
  private readonly epochFingerprint = randomFingerprint()
  private readonly streams = new Map<number, TerminalMultiplexStreamTelemetry>()
  private readonly opcodeCounts = new Map<string, number>()
  private readonly opcodeBytes = new Map<string, number>()
  private readonly timer: ReturnType<typeof setInterval>
  private lastGcPauseMs = cumulativeGcPauseMs

  constructor(lane: string) {
    this.lane = lane
    this.timer = setInterval(() => this.flush('interval'), SAMPLE_INTERVAL_MS)
    this.timer.unref?.()
  }

  noteFrame(direction: 'received' | 'sent', opcode: TerminalMultiplexOpcode, bytes: number): void {
    const key = `${direction}.${opcode}`
    this.opcodeCounts.set(key, (this.opcodeCounts.get(key) ?? 0) + 1)
    this.opcodeBytes.set(key, (this.opcodeBytes.get(key) ?? 0) + bytes)
  }

  noteConnectionEvent(kind: string): void {
    this.emit('terminal.multiplex.connection-event', { event: kind })
  }

  openStream(routeId: number): TerminalMultiplexStreamTelemetry {
    const telemetry = new TerminalMultiplexStreamTelemetry(
      this.lane,
      this.environmentFingerprint,
      this.epochFingerprint,
      () => this.streams.delete(routeId)
    )
    this.streams.set(routeId, telemetry)
    return telemetry
  }

  close(): void {
    clearInterval(this.timer)
    this.flush('close')
    for (const stream of this.streams.values()) {
      stream.close()
    }
    this.streams.clear()
  }

  private flush(reason: 'interval' | 'close'): void {
    const memory = process.memoryUsage()
    const gcPauseMs = Math.max(0, cumulativeGcPauseMs - this.lastGcPauseMs)
    this.lastGcPauseMs = cumulativeGcPauseMs
    this.emit('terminal.multiplex.connection-metrics', {
      reason,
      opcode_counts: JSON.stringify(Object.fromEntries(this.opcodeCounts)),
      opcode_bytes: JSON.stringify(Object.fromEntries(this.opcodeBytes)),
      active_streams: this.streams.size,
      rss_bytes: memory.rss,
      heap_used_bytes: memory.heapUsed,
      gc_pause_ms: gcPauseMs
    })
    this.opcodeCounts.clear()
    this.opcodeBytes.clear()
    for (const stream of this.streams.values()) {
      stream.flush(reason)
    }
  }

  private emit(name: string, attributes: Record<string, unknown>): void {
    const span = startSpan(name, {
      attributes: {
        lane: this.lane,
        environment_fingerprint: this.environmentFingerprint,
        epoch_fingerprint: this.epochFingerprint,
        ...attributes
      }
    })
    span.end()
  }
}

export class TerminalMultiplexStreamTelemetry {
  private readonly streamFingerprint = randomFingerprint()
  private readonly emitBase: Record<string, string>
  private readonly onClose: () => void
  private flow: FlowSample | null = null
  private maxInFlightBytes = 0
  private maxUnsentBytes = 0
  private ackStalls = 0
  private gaps = 0
  private hiddenDrops = 0
  private producerPauses = 0

  constructor(
    lane: string,
    environmentFingerprint: string,
    epochFingerprint: string,
    onClose: () => void
  ) {
    this.emitBase = {
      lane,
      environment_fingerprint: environmentFingerprint,
      epoch_fingerprint: epochFingerprint,
      stream_fingerprint: this.streamFingerprint
    }
    this.onClose = onClose
  }

  observeFlow(sample: FlowSample): void {
    if (sample.isProducerPaused && !this.flow?.isProducerPaused) {
      this.producerPauses += 1
    }
    this.flow = sample
    this.maxInFlightBytes = Math.max(this.maxInFlightBytes, sample.inFlightBytes)
    this.maxUnsentBytes = Math.max(this.maxUnsentBytes, sample.unsentBytes)
  }

  noteAckStall(): void {
    this.ackStalls += 1
  }

  noteGap(): void {
    this.gaps += 1
  }

  noteHiddenDrop(): void {
    this.hiddenDrops += 1
  }

  noteSnapshot(sample: SnapshotSample): void {
    this.emit('terminal.multiplex.snapshot', sample)
  }

  close(): void {
    this.flush('close')
    this.onClose()
  }

  flush(reason: 'interval' | 'close'): void {
    this.emit('terminal.multiplex.stream-metrics', {
      reason,
      credit_bytes: this.flow?.creditBytes ?? 0,
      in_flight_bytes: this.flow?.inFlightBytes ?? 0,
      max_in_flight_bytes: this.maxInFlightBytes,
      unsent_bytes: this.flow?.unsentBytes ?? 0,
      max_unsent_bytes: this.maxUnsentBytes,
      receiver_queue_bytes: this.flow?.receiverQueueBytes ?? 0,
      socket_queue_bytes: this.flow?.socketQueueBytes ?? 0,
      rtt_ms: this.flow?.rttMs ?? -1,
      delivery_rate_bytes_per_ms: this.flow?.deliveryRateBytesPerMs ?? -1,
      producer_paused: this.flow?.isProducerPaused ?? false,
      producer_pauses: this.producerPauses,
      ack_stalls: this.ackStalls,
      gaps: this.gaps,
      hidden_drops: this.hiddenDrops
    })
    this.maxInFlightBytes = this.flow?.inFlightBytes ?? 0
    this.maxUnsentBytes = this.flow?.unsentBytes ?? 0
    this.producerPauses = 0
    this.ackStalls = 0
    this.gaps = 0
    this.hiddenDrops = 0
  }

  private emit(name: string, attributes: Record<string, unknown>): void {
    const span = startSpan(name, { attributes: { ...this.emitBase, ...attributes } })
    span.end()
  }
}

function randomFingerprint(): string {
  // Why: docs/reference/terminal-multiplex.md §23 forbids raw identifiers. Per-connection
  // random labels correlate samples without making environment or terminal IDs recoverable.
  return randomBytes(6).toString('hex')
}

export function recordTerminalMultiplexAdmissionEvent(event: string): void {
  const span = startSpan('terminal.multiplex.admission', { attributes: { event } })
  span.end()
}
