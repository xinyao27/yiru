import type { RitualRunResult, RitualScheduleStatus } from '@yiru/runtime-protocol/contract'

import type { RitualService } from './service'

const POLL_INTERVAL_MS = 30_000
const RETRY_DELAY_MS = 5 * 60_000
const WEEKDAY_INDEX = new Map([
  ['Sun', 0],
  ['Mon', 1],
  ['Tue', 2],
  ['Wed', 3],
  ['Thu', 4],
  ['Fri', 5],
  ['Sat', 6]
])

export class RitualScheduler {
  private readonly rituals: RitualService
  private running = false
  private timer: Timer | null = null

  constructor(rituals: RitualService) {
    this.rituals = rituals
  }

  start(): void {
    if (this.timer) {
      return
    }
    void this.tick()
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS)
    this.timer.unref()
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return
    }
    const schedule = this.rituals.getSchedule()
    const kind = dueRitual(schedule, Date.now())
    if (!kind) {
      return
    }
    this.running = true
    try {
      await this.runWithRecovery(kind)
    } finally {
      this.running = false
    }
  }

  private async runWithRecovery(kind: RitualRunResult['kind']): Promise<void> {
    try {
      await this.rituals.run(kind)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.rituals.recordScheduleFailure(kind, detail)
      await Bun.sleep(RETRY_DELAY_MS)
      try {
        await this.rituals.run(kind)
      } catch (retryError) {
        this.rituals.recordScheduleFailure(
          kind,
          retryError instanceof Error ? retryError.message : String(retryError)
        )
      }
    }
  }
}

function dueRitual(schedule: RitualScheduleStatus, now: number): RitualRunResult['kind'] | null {
  if (!schedule.enabled) {
    return null
  }
  const parts = zonedParts(now, schedule.timezone)
  if (!schedule.weekdays.includes(parts.weekday)) {
    return null
  }
  const minutes = parts.hour * 60 + parts.minute
  if (
    minutes === schedule.startMinutes &&
    !sameLocalDate(schedule.lastStartAt, now, schedule.timezone)
  ) {
    return 'start-day'
  }
  return minutes === schedule.endMinutes &&
    !sameLocalDate(schedule.lastEndAt, now, schedule.timezone)
    ? 'end-day'
    : null
}

function sameLocalDate(left: number | null, right: number, timezone: string): boolean {
  return left !== null && zonedParts(left, timezone).date === zonedParts(right, timezone).date
}

function zonedParts(
  timestamp: number,
  timezone: string
): { date: string; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric'
  }).formatToParts(timestamp)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  const weekday = WEEKDAY_INDEX.get(values.get('weekday') ?? '')
  if (weekday === undefined) {
    throw new Error('ritual_schedule_weekday_invalid')
  }
  return {
    date: `${values.get('year')}-${values.get('month')}-${values.get('day')}`,
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
    weekday
  }
}
