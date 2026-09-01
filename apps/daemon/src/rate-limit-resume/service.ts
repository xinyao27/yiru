import {
  buildRateLimitResumeAt,
  isFinalRateLimitResumeStatus,
  type CodexUsageLimitProbe,
  type RateLimitHit,
  type RateLimitResumeSchedule
} from '@yiru/runtime-protocol/workbench/rate-limit-resume/types'
import type { ShellServicesConnectionId } from '~main/runtime/rpc/orpc/shell-services-identity'
import { requestShellRateLimitResumeDispatch } from '~main/runtime/rpc/orpc/shell-services-reverse-link'

import type { Store } from '../persistence/store'
import { readCodexUsageLimitEvent } from './codex-rollout'
import { resolveCodexRateLimitHit, type RateLimitResumeUsageState } from './reset-resolution'

const DEFAULT_TICK_MS = 30 * 1000

export class RateLimitResumeService {
  private readonly store: Store
  private readonly rateLimits: { getState: () => RateLimitResumeUsageState }
  private readonly tickMs: number
  private timer: ReturnType<typeof setInterval> | null = null
  private shellConnectionId: ShellServicesConnectionId | null = null
  private rendererReady = false
  private readonly unsubscribeResume: () => void

  constructor(
    store: Store,
    rateLimits: { getState: () => RateLimitResumeUsageState },
    opts: {
      tickMs?: number
      subscribeToWake?: (listener: () => void) => () => void
    } = {}
  ) {
    this.store = store
    this.rateLimits = rateLimits
    this.tickMs = opts.tickMs ?? DEFAULT_TICK_MS
    this.unsubscribeResume = opts.subscribeToWake?.(() => this.dispatchDueResumes()) ?? (() => {})
  }

  setShellConnectionId(shellConnectionId: ShellServicesConnectionId | null): void {
    this.shellConnectionId = shellConnectionId
    this.rendererReady = false
  }

  clearShellConnectionId(shellConnectionId: ShellServicesConnectionId): void {
    if (this.shellConnectionId === shellConnectionId) {
      this.setShellConnectionId(null)
    }
  }

  setRendererReady(shellConnectionId: ShellServicesConnectionId): boolean {
    if (this.shellConnectionId !== shellConnectionId) {
      return false
    }
    this.rendererReady = true
    this.dispatchDueResumes()
    return true
  }

  start(): void {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => this.dispatchDueResumes(), this.tickMs)
  }

  stop(): void {
    if (!this.timer) {
      return
    }
    clearInterval(this.timer)
    this.timer = null
  }

  dispose(): void {
    this.stop()
    this.unsubscribeResume()
  }

  async inspectCodex(probe: CodexUsageLimitProbe): Promise<RateLimitHit | null> {
    const event = await readCodexUsageLimitEvent(probe)
    return event
      ? resolveCodexRateLimitHit(probe, event, this.rateLimits.getState(), Date.now())
      : null
  }

  list(): RateLimitResumeSchedule[] {
    return this.store.listRateLimitResumes()
  }

  schedule(hit: RateLimitHit): RateLimitResumeSchedule {
    if (hit.resetsAt === null) {
      throw new Error('Cannot schedule a resume without a reset time.')
    }
    return this.store.createRateLimitResume(hit, buildRateLimitResumeAt(hit.resetsAt, Date.now()))
  }

  cancel(id: string): RateLimitResumeSchedule {
    return this.store.updateRateLimitResume(id, { status: 'cancelled' })
  }

  markFired(id: string): RateLimitResumeSchedule {
    return this.store.updateRateLimitResume(id, { status: 'fired', firedAt: Date.now() })
  }

  markFailed(id: string, reason: string): RateLimitResumeSchedule {
    return this.store.updateRateLimitResume(id, { status: 'failed', failureReason: reason })
  }

  /** The pane the resume targeted is gone; nothing left to replay into. */
  markStale(id: string): RateLimitResumeSchedule {
    return this.store.updateRateLimitResume(id, { status: 'stale' })
  }

  async runNow(id: string): Promise<RateLimitResumeSchedule> {
    const schedule = this.list().find((entry) => entry.id === id)
    if (!schedule) {
      throw new Error('Rate-limit resume not found.')
    }
    if (!(await this.sendDispatch(schedule))) {
      throw new Error('No Yiru window was available to resume the session.')
    }
    return schedule
  }

  private dispatchDueResumes(): void {
    const now = Date.now()
    for (const schedule of this.list()) {
      if (isFinalRateLimitResumeStatus(schedule.status) || schedule.resumeAt > now) {
        continue
      }
      // A dispatch with no window/shell link stays scheduled and retries on
      // the next tick — fire-and-forget matches the pre-reverse-link
      // behavior, where a send into an unmounted listener also
      // silently went nowhere.
      void this.sendDispatch(schedule)
    }
  }

  private async sendDispatch(schedule: RateLimitResumeSchedule): Promise<boolean> {
    const shellConnectionId = this.shellConnectionId
    if (!shellConnectionId || !this.rendererReady) {
      return false
    }
    const result = await requestShellRateLimitResumeDispatch(shellConnectionId, schedule)
    return result.ok
  }
}
