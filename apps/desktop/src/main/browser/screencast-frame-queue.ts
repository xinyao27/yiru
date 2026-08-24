import {
  BrowserScreencastOpcode,
  encodeBrowserScreencastFrame
} from '~shared/browser/screencast-protocol'

import type { BrowserPageCdpLease } from './page/handle'
import { sendScreencastDebuggerCommand } from './screencast-debugger-command'
import type { BrowserScreencastOptions, PendingScreencastFrame } from './screencast-types'

const BACKPRESSURE_RETRY_MS = 50

export class BrowserScreencastFrameQueue {
  private readonly cdp: BrowserPageCdpLease
  private readonly isStopped: () => boolean
  private lastFrameSentAt = 0
  private readonly options: BrowserScreencastOptions
  private pendingFrame: PendingScreencastFrame | null = null
  private pendingFrameTimer: ReturnType<typeof setTimeout> | null = null
  private seq = 0

  constructor(
    cdp: BrowserPageCdpLease,
    options: BrowserScreencastOptions,
    isStopped: () => boolean
  ) {
    this.cdp = cdp
    this.options = options
    this.isStopped = isStopped
  }

  hasSentFrame(): boolean {
    return this.seq > 0
  }

  clear(ackPending = false): void {
    const pending = this.pendingFrame
    this.pendingFrame = null
    if (this.pendingFrameTimer) {
      clearTimeout(this.pendingFrameTimer)
      this.pendingFrameTimer = null
    }
    if (ackPending) {
      this.ack(pending?.sessionId)
    }
  }

  queue(frame: PendingScreencastFrame): void {
    if (this.isStopped()) {
      return
    }
    const elapsed = Date.now() - this.lastFrameSentAt
    if (
      this.options.minFrameIntervalMs <= 0 ||
      this.lastFrameSentAt === 0 ||
      elapsed >= this.options.minFrameIntervalMs
    ) {
      this.clear(true)
      this.deliverOrRetry(frame)
      return
    }
    // Why: a static change may be Chromium's final frame. Retain the newest
    // throttled frame instead of dropping the final visual state forever.
    if (this.pendingFrame?.sessionId !== frame.sessionId) {
      this.ack(this.pendingFrame?.sessionId)
    }
    this.pendingFrame = frame
    if (!this.pendingFrameTimer) {
      this.pendingFrameTimer = setTimeout(
        () => this.flushPending(),
        Math.max(0, this.options.minFrameIntervalMs - elapsed)
      )
    }
  }

  ack(sessionId: number | undefined): void {
    if (sessionId === undefined) {
      return
    }
    // Why: CDP gates the next frame on this ACK, which is the stream's first
    // backpressure boundary before base64 work can accumulate.
    void sendScreencastDebuggerCommand(this.cdp, 'Page.screencastFrameAck', {
      sessionId
    }).catch(() => {})
  }

  private emit(frame: PendingScreencastFrame): boolean {
    if (this.isStopped()) {
      return false
    }
    this.lastFrameSentAt = Date.now()
    const accepted = this.options.onFrame(
      encodeBrowserScreencastFrame({
        opcode: BrowserScreencastOpcode.Frame,
        seq: this.seq++,
        format: this.options.format,
        metadata: frame.metadata,
        image: frame.image
      })
    )
    return accepted !== false
  }

  private deliverOrRetry(frame: PendingScreencastFrame): void {
    if (this.emit(frame)) {
      this.ack(frame.sessionId)
      return
    }
    this.pendingFrame = frame
    this.scheduleRetry()
  }

  private flushPending(): void {
    this.pendingFrameTimer = null
    const latest = this.pendingFrame
    this.pendingFrame = null
    if (!latest || this.isStopped()) {
      return
    }
    this.deliverOrRetry(latest)
  }

  private scheduleRetry(): void {
    if (this.pendingFrameTimer || this.isStopped()) {
      return
    }
    this.pendingFrameTimer = setTimeout(() => this.flushPending(), BACKPRESSURE_RETRY_MS)
  }
}
