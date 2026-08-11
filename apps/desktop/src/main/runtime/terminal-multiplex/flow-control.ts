const KIB = 1024
const MIB = 1024 * KIB
const WINDOW_STEP_BYTES = 64 * KIB

type SentFrame = { startSeq: bigint; endSeq: bigint; sentAt: number }

export type TerminalMultiplexFlowUpdate = {
  acknowledgedBytes: number
  windowChanged: boolean
  windowBytes: number
}

export type TerminalMultiplexFlowTelemetry = {
  inFlightBytes: number
  receiverQueueBytes: number
  socketQueueBytes: number
  rttMs: number | null
  deliveryRateBytesPerMs: number | null
}

export class TerminalMultiplexOutputFlow {
  private acknowledgedSeq = 0n
  private sentSeq = 0n
  private readonly sentFrames: SentFrame[] = []
  private minRttMs: number | null = null
  private srttMs: number | null = null
  private deliveryRateBytesPerMs: number | null = null
  private previousAckAt: number | null = null
  private congestionIntervals = 0
  private belowTargetIntervals = 0
  private receiverQueueBytes = 0
  private socketQueueBytes = 0
  private windowBytes = 2 * MIB

  get currentWindowBytes(): number {
    return this.windowBytes
  }

  get inFlightBytes(): number {
    const difference = this.sentSeq - this.acknowledgedSeq
    return difference > BigInt(Number.MAX_SAFE_INTEGER)
      ? Number.MAX_SAFE_INTEGER
      : Number(difference)
  }

  get earliestInFlightSeq(): bigint | null {
    return this.sentFrames[0]?.startSeq ?? null
  }

  get telemetry(): TerminalMultiplexFlowTelemetry {
    return {
      inFlightBytes: this.inFlightBytes,
      receiverQueueBytes: this.receiverQueueBytes,
      socketQueueBytes: this.socketQueueBytes,
      rttMs: this.srttMs,
      deliveryRateBytesPerMs: this.deliveryRateBytesPerMs
    }
  }

  rebase(seq: bigint): void {
    this.acknowledgedSeq = seq
    this.sentSeq = seq
    this.sentFrames.splice(0)
  }

  canSend(payloadBytes: number, connectionInFlightBytes: number): boolean {
    return (
      payloadBytes > 0 &&
      this.inFlightBytes + payloadBytes <= this.windowBytes &&
      connectionInFlightBytes + payloadBytes <= 32 * MIB
    )
  }

  noteSent(startSeq: bigint, endSeq: bigint, sentAt = performance.now()): void {
    this.sentSeq = endSeq > this.sentSeq ? endSeq : this.sentSeq
    this.sentFrames.push({ startSeq, endSeq, sentAt })
  }

  noteSocketQueue(bytes: number): void {
    this.socketQueueBytes = Math.max(0, bytes)
  }

  acknowledge(
    seq: bigint,
    receiverQueueBytes: number,
    now = performance.now()
  ): TerminalMultiplexFlowUpdate {
    if (seq <= this.acknowledgedSeq || seq > this.sentSeq) {
      return { acknowledgedBytes: 0, windowChanged: false, windowBytes: this.windowBytes }
    }
    const previousSeq = this.acknowledgedSeq
    this.acknowledgedSeq = seq
    this.receiverQueueBytes = receiverQueueBytes
    const newlyAcknowledged = seq - previousSeq
    const acknowledgedBytes =
      newlyAcknowledged > BigInt(Number.MAX_SAFE_INTEGER)
        ? Number.MAX_SAFE_INTEGER
        : Number(newlyAcknowledged)
    const oldest = this.sentFrames.find((frame) => frame.endSeq > previousSeq)
    while (this.sentFrames[0] && this.sentFrames[0]!.endSeq <= seq) {
      this.sentFrames.shift()
    }
    if (oldest) {
      this.observeRtt(Math.max(0.001, now - oldest.sentAt))
    }
    if (this.previousAckAt !== null) {
      const intervalMs = Math.max(1, now - this.previousAckAt)
      const sampleRate = acknowledgedBytes / intervalMs
      this.deliveryRateBytesPerMs =
        this.deliveryRateBytesPerMs === null
          ? sampleRate
          : this.deliveryRateBytesPerMs * 0.75 + sampleRate * 0.25
    }
    this.previousAckAt = now
    const previousWindow = this.windowBytes
    this.adjustWindow()
    return {
      acknowledgedBytes,
      windowChanged: shouldPublishWindow(previousWindow, this.windowBytes),
      windowBytes: this.windowBytes
    }
  }

  isStalled(now = performance.now()): boolean {
    const oldest = this.sentFrames[0]
    if (!oldest) {
      return false
    }
    return now - oldest.sentAt >= Math.max(2_000, 4 * (this.srttMs ?? 500))
  }

  private observeRtt(sampleMs: number): void {
    this.minRttMs = this.minRttMs === null ? sampleMs : Math.min(this.minRttMs, sampleMs)
    this.srttMs = this.srttMs === null ? sampleMs : this.srttMs * 0.875 + sampleMs * 0.125
  }

  private adjustWindow(): void {
    if (this.srttMs === null || this.deliveryRateBytesPerMs === null) {
      return
    }
    const rawTarget = 2 * this.deliveryRateBytesPerMs * Math.max(this.srttMs, 1) + 4 * 32 * KIB
    const target = roundUpStep(clamp(rawTarget, 1 * MIB, 8 * MIB), WINDOW_STEP_BYTES)
    const congested =
      this.receiverQueueBytes > this.windowBytes / 2 ||
      this.socketQueueBytes > 8 * MIB ||
      (this.minRttMs !== null && this.srttMs > 2 * this.minRttMs)
    this.congestionIntervals = congested ? this.congestionIntervals + 1 : 0
    this.belowTargetIntervals = target < this.windowBytes * 0.75 ? this.belowTargetIntervals + 1 : 0
    if (this.congestionIntervals >= 3) {
      this.windowBytes = Math.max(
        this.inFlightBytes,
        1 * MIB,
        roundDownStep(Math.max(target, this.windowBytes * 0.75), WINDOW_STEP_BYTES)
      )
      this.congestionIntervals = 0
    } else if (target > this.windowBytes) {
      this.windowBytes = Math.min(
        target,
        this.windowBytes + Math.max(WINDOW_STEP_BYTES, this.windowBytes / 4)
      )
    } else if (this.belowTargetIntervals >= 3) {
      this.windowBytes = Math.max(this.inFlightBytes, 1 * MIB, target)
      this.belowTargetIntervals = 0
    }
  }
}

function shouldPublishWindow(previous: number, next: number): boolean {
  const delta = Math.abs(next - previous)
  return delta >= WINDOW_STEP_BYTES || delta / Math.max(previous, 1) >= 0.125
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundUpStep(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

function roundDownStep(value: number, step: number): number {
  return Math.floor(value / step) * step
}
