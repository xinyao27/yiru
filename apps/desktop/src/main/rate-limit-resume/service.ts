// Owns the rate-limit resume lifecycle in main: enrich a reported banner with
// a reset time, persist the schedule, and dispatch the replay to the renderer
// once the provider window has rolled over.

import { powerMonitor, type WebContents } from 'electron'
import {
  buildRateLimitResumeAt,
  isFinalRateLimitResumeStatus,
  type RateLimitBannerReport,
  type RateLimitHit,
  type RateLimitResumeSchedule
} from '~shared/rate-limit-resume/types'

import type { Store } from '../persistence'
import type { RateLimitService } from '../rate-limits/service'
import { resolveRateLimitHit } from './reset-resolution'

const DEFAULT_TICK_MS = 30 * 1000

export const RATE_LIMIT_RESUME_DISPATCH_CHANNEL = 'rateLimitResume:dispatchRequested'

export class RateLimitResumeService {
  private readonly store: Store
  private readonly rateLimits: RateLimitService
  private readonly tickMs: number
  private timer: ReturnType<typeof setInterval> | null = null
  private webContents: WebContents | null = null
  private rendererReady = false
  private readonly unsubscribeResume: () => void

  constructor(store: Store, rateLimits: RateLimitService, opts: { tickMs?: number } = {}) {
    this.store = store
    this.rateLimits = rateLimits
    this.tickMs = opts.tickMs ?? DEFAULT_TICK_MS
    // Why: the interval does not fire while the machine sleeps, so a resume
    // scheduled across a sleep would sit due until the next tick after wake.
    const onResume = (): void => this.dispatchDueResumes()
    powerMonitor.on('resume', onResume)
    this.unsubscribeResume = () => powerMonitor.off('resume', onResume)
  }

  setWebContents(webContents: WebContents | null): void {
    this.webContents = webContents
    this.rendererReady = false
  }

  setRendererReady(): void {
    this.rendererReady = true
    this.dispatchDueResumes()
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

  /** Resolve a renderer-reported banner into a hit with a reset time. */
  reportBanner(report: RateLimitBannerReport): RateLimitHit {
    return resolveRateLimitHit(report, this.rateLimits.getState(), Date.now())
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

  runNow(id: string): RateLimitResumeSchedule {
    const schedule = this.list().find((entry) => entry.id === id)
    if (!schedule) {
      throw new Error('Rate-limit resume not found.')
    }
    if (!this.sendDispatch(schedule)) {
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
      // A dispatch with no window stays scheduled and retries on the next tick.
      this.sendDispatch(schedule)
    }
  }

  private sendDispatch(schedule: RateLimitResumeSchedule): boolean {
    const webContents = this.webContents
    if (!webContents || webContents.isDestroyed() || !this.rendererReady) {
      return false
    }
    webContents.send(RATE_LIMIT_RESUME_DISPATCH_CHANNEL, schedule)
    return true
  }
}
