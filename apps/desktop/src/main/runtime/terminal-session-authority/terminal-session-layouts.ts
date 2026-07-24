import type { TerminalSessionEvents } from './terminal-session-events'
import type {
  TerminalFitOverride,
  TerminalLayoutResult,
  TerminalLayoutState,
  TerminalLayoutTarget
} from './terminal-session-layout-types'

type LayoutQueueEntry = {
  running: Promise<TerminalLayoutResult> | null
  pending: {
    target: TerminalLayoutTarget
    allowInitial: boolean
    waiters: ((result: TerminalLayoutResult) => void)[]
  }[]
}

export type TerminalSessionLayoutPort = {
  getPtySize(ptyId: string): { cols: number; rows: number } | null
  resizePty(ptyId: string, cols: number, rows: number): boolean
  resizeHeadlessTerminal(ptyId: string, cols: number, rows: number): void
  notifyFitOverride(
    ptyId: string,
    mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit',
    cols: number,
    rows: number
  ): void
}

export class TerminalSessionLayouts {
  private readonly fitOverrides = new Map<string, TerminalFitOverride>()
  private readonly lastRendererSizes = new Map<string, { cols: number; rows: number }>()
  private readonly layouts = new Map<string, TerminalLayoutState>()
  private readonly queues = new Map<string, LayoutQueueEntry>()
  private resizeSuppressedUntil = 0

  constructor(
    private readonly port: TerminalSessionLayoutPort,
    private readonly events: TerminalSessionEvents,
    private readonly getMobileRestoreBaseline: (
      ptyId: string
    ) => { previousCols: number; previousRows: number } | null
  ) {}

  getLayout(ptyId: string): TerminalLayoutState | null {
    return this.layouts.get(ptyId) ?? null
  }

  hasLayout(ptyId: string): boolean {
    return this.layouts.has(ptyId)
  }

  getFitOverride(ptyId: string): TerminalFitOverride | null {
    return this.fitOverrides.get(ptyId) ?? null
  }

  getFitOverrides(): Map<string, TerminalFitOverride> {
    return new Map(this.fitOverrides)
  }

  hasFitOverride(ptyId: string): boolean {
    return this.fitOverrides.has(ptyId)
  }

  releaseFitOverride(ptyId: string): boolean {
    if (!this.fitOverrides.delete(ptyId)) {
      return false
    }
    this.port.notifyFitOverride(ptyId, 'desktop-fit', 0, 0)
    this.events.emitFit(ptyId, { mode: 'desktop-fit', cols: 0, rows: 0 })
    return true
  }

  setLastRendererSize(ptyId: string, cols: number, rows: number): void {
    this.lastRendererSizes.set(ptyId, { cols, rows })
  }

  getLastRendererSize(ptyId: string): { cols: number; rows: number } | null {
    return this.lastRendererSizes.get(ptyId) ?? null
  }

  resolveDesktopRestoreTarget(ptyId: string): { cols: number; rows: number } {
    const subscriber = this.getMobileRestoreBaseline(ptyId)
    if (subscriber) {
      return { cols: subscriber.previousCols, rows: subscriber.previousRows }
    }
    return (
      this.lastRendererSizes.get(ptyId) ?? this.port.getPtySize(ptyId) ?? { cols: 80, rows: 24 }
    )
  }

  isResizeSuppressed(): boolean {
    return Date.now() < this.resizeSuppressedUntil
  }

  suppressResizesForMs(ms: number): void {
    this.resizeSuppressedUntil = Date.now() + ms
  }

  enqueue(
    ptyId: string,
    target: TerminalLayoutTarget,
    allowInitial = false
  ): Promise<TerminalLayoutResult> {
    if (!this.layouts.has(ptyId) && !allowInitial) {
      return Promise.resolve({ ok: false, reason: 'pty-exited' })
    }
    let queue = this.queues.get(ptyId)
    if (!queue) {
      queue = { running: null, pending: [] }
      this.queues.set(ptyId, queue)
    }
    return new Promise<TerminalLayoutResult>((resolve) => {
      if (!queue.running) {
        queue.running = this.runSlot(ptyId, target, allowInitial, [resolve])
        return
      }
      const tail = queue.pending.at(-1)
      if (tail && this.coalescesWith(tail.target, target)) {
        tail.target = target
        tail.allowInitial ||= allowInitial
        tail.waiters.push(resolve)
        return
      }
      queue.pending.push({ target, allowInitial, waiters: [resolve] })
    })
  }

  clearPty(ptyId: string): void {
    // Why: deleting the queue fences pending layout work after PTY exit; the
    // running slot observes the missing queue before advancing its tail.
    this.layouts.delete(ptyId)
    this.queues.delete(ptyId)
    this.lastRendererSizes.delete(ptyId)
    this.releaseFitOverride(ptyId)
  }

  // Why: viewport ticks may coalesce, but ownership transitions preserve their
  // own queue slot so a later actor cannot erase an earlier floor handoff.
  private coalescesWith(previous: TerminalLayoutTarget, next: TerminalLayoutTarget): boolean {
    if (previous.kind !== next.kind) {
      return false
    }
    if (previous.kind === 'phone' && next.kind === 'phone') {
      return previous.ownerClientId === next.ownerClientId
    }
    if (previous.kind === 'remote-desktop' && next.kind === 'remote-desktop') {
      // Why: each owner's claim promise gates its input; cross-owner coalescing
      // could release one viewer only after another viewer's grid lands.
      return previous.ownerSubscriptionKey === next.ownerSubscriptionKey
    }
    return true
  }

  private async runSlot(
    ptyId: string,
    target: TerminalLayoutTarget,
    allowInitial: boolean,
    waiters: ((result: TerminalLayoutResult) => void)[]
  ): Promise<TerminalLayoutResult> {
    let result: TerminalLayoutResult
    try {
      result = await this.apply(ptyId, target, allowInitial)
    } catch (error) {
      console.error('[layout] applyLayout threw', { ptyId, error })
      result = { ok: false, reason: 'resize-failed' }
    }
    for (const waiter of waiters) {
      waiter(result)
    }
    const queue = this.queues.get(ptyId)
    if (!queue) {
      return result
    }
    const next = queue.pending.shift()
    if (next) {
      queue.running = this.runSlot(ptyId, next.target, next.allowInitial, next.waiters)
    } else {
      queue.running = null
      this.queues.delete(ptyId)
    }
    return result
  }

  private async apply(
    ptyId: string,
    target: TerminalLayoutTarget,
    allowInitial: boolean
  ): Promise<TerminalLayoutResult> {
    if (!this.layouts.has(ptyId) && !allowInitial) {
      return { ok: false, reason: 'pty-exited' }
    }
    const previous = this.layouts.get(ptyId) ?? null
    const next: TerminalLayoutState = {
      ...target,
      seq: (previous?.seq ?? 0) + 1,
      appliedAt: Date.now()
    }
    const currentSize = this.port.getPtySize(ptyId)
    const dimensionsChanged = currentSize?.cols !== target.cols || currentSize?.rows !== target.rows
    const modeChanged = (previous?.kind ?? 'desktop') !== target.kind
    const previousOverride = this.fitOverrides.get(ptyId) ?? null

    this.layouts.set(ptyId, next)
    if (target.kind === 'phone') {
      const baseline = this.getMobileRestoreBaseline(ptyId)
      this.fitOverrides.set(ptyId, {
        mode: 'mobile-fit',
        cols: target.cols,
        rows: target.rows,
        previousCols: baseline?.previousCols ?? null,
        previousRows: baseline?.previousRows ?? null,
        updatedAt: next.appliedAt,
        clientId: target.ownerClientId
      })
    } else {
      this.fitOverrides.delete(ptyId)
    }

    if (dimensionsChanged && !this.resize(ptyId, target, previous, previousOverride)) {
      return { ok: false, reason: 'resize-failed' }
    }
    const overrideChanged = (previousOverride !== null) !== (target.kind === 'phone')
    if (target.kind === 'remote-desktop' || modeChanged || overrideChanged) {
      if (target.kind === 'desktop') {
        this.lastRendererSizes.delete(ptyId)
        this.suppressResizesForMs(500)
      }
      const mode =
        target.kind === 'phone'
          ? 'mobile-fit'
          : target.kind === 'remote-desktop'
            ? 'remote-desktop-fit'
            : 'desktop-fit'
      this.port.notifyFitOverride(ptyId, mode, target.cols, target.rows)
      this.events.emitFit(ptyId, { mode, cols: target.cols, rows: target.rows })
    }
    this.events.emitResize(ptyId, {
      cols: target.cols,
      rows: target.rows,
      displayMode: target.kind === 'phone' ? 'phone' : 'desktop',
      reason: 'apply-layout',
      seq: next.seq
    })
    return { ok: true, state: next }
  }

  private resize(
    ptyId: string,
    target: TerminalLayoutTarget,
    previous: TerminalLayoutState | null,
    previousOverride: TerminalFitOverride | null
  ): boolean {
    let resized = false
    try {
      resized = this.port.resizePty(ptyId, target.cols, target.rows)
    } catch (error) {
      console.error('[layout] pty resize threw', { ptyId, error })
    }
    if (resized) {
      this.port.resizeHeadlessTerminal(ptyId, target.cols, target.rows)
      return true
    }
    if (previous) {
      this.layouts.set(ptyId, previous)
    } else {
      this.layouts.delete(ptyId)
    }
    if (previousOverride) {
      this.fitOverrides.set(ptyId, previousOverride)
    } else {
      this.fitOverrides.delete(ptyId)
    }
    return false
  }
}
