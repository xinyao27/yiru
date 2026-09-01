import type { RitualSchedule, RitualScheduleStatus } from '@yiru/runtime-protocol/contract'

import type { DaemonDatabase } from '../store/database'

type RitualScheduleRow = {
  archiveOnEndDay: number
  enabled: number
  endMinutes: number
  lastEndAt: number | null
  lastFailure: string | null
  lastStartAt: number | null
  startMinutes: number
  timezone: string
  weekdaysJson: string
}

const DEFAULT_SCHEDULE = {
  archiveOnEndDay: false,
  enabled: false,
  endMinutes: 18 * 60,
  startMinutes: 9 * 60,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  weekdays: [1, 2, 3, 4, 5]
} satisfies RitualSchedule

export class RitualScheduleStore {
  private readonly database: DaemonDatabase

  constructor(database: DaemonDatabase) {
    this.database = database
    this.database.sqlite
      .query(
        `INSERT INTO ritual_schedule(
           id, enabled, start_minutes, end_minutes, timezone, weekdays_json, archive_on_end_day
         ) VALUES (1, 0, ?1, ?2, ?3, ?4, 0)
         ON CONFLICT(id) DO NOTHING`
      )
      .run(
        DEFAULT_SCHEDULE.startMinutes,
        DEFAULT_SCHEDULE.endMinutes,
        DEFAULT_SCHEDULE.timezone,
        JSON.stringify(DEFAULT_SCHEDULE.weekdays)
      )
  }

  read(): RitualScheduleStatus {
    const row = this.database.sqlite
      .query<RitualScheduleRow, []>(
        `SELECT enabled, start_minutes AS startMinutes, end_minutes AS endMinutes,
                timezone, weekdays_json AS weekdaysJson,
                archive_on_end_day AS archiveOnEndDay, last_start_at AS lastStartAt,
                last_end_at AS lastEndAt, last_failure AS lastFailure
         FROM ritual_schedule WHERE id = 1`
      )
      .get()
    if (!row) {
      throw new Error('ritual_schedule_missing')
    }
    return {
      archiveOnEndDay: row.archiveOnEndDay === 1,
      enabled: row.enabled === 1,
      endMinutes: row.endMinutes,
      lastEndAt: row.lastEndAt,
      lastFailure: row.lastFailure,
      lastStartAt: row.lastStartAt,
      startMinutes: row.startMinutes,
      timezone: row.timezone,
      weekdays: parseWeekdays(row.weekdaysJson)
    }
  }

  update(schedule: RitualSchedule): RitualScheduleStatus {
    validateSchedule(schedule)
    this.database.sqlite
      .query(
        `UPDATE ritual_schedule SET enabled = ?1, start_minutes = ?2, end_minutes = ?3,
           timezone = ?4, weekdays_json = ?5, archive_on_end_day = ?6, last_failure = NULL
         WHERE id = 1`
      )
      .run(
        schedule.enabled ? 1 : 0,
        schedule.startMinutes,
        schedule.endMinutes,
        schedule.timezone,
        JSON.stringify([...new Set(schedule.weekdays)].toSorted()),
        schedule.archiveOnEndDay ? 1 : 0
      )
    return this.read()
  }

  recordRun(kind: 'end-day' | 'start-day', occurredAt: number): void {
    this.database.sqlite
      .query(
        kind === 'start-day'
          ? 'UPDATE ritual_schedule SET last_start_at = ?1, last_failure = NULL WHERE id = 1'
          : 'UPDATE ritual_schedule SET last_end_at = ?1, last_failure = NULL WHERE id = 1'
      )
      .run(occurredAt)
  }

  recordFailure(detail: string): void {
    this.database.sqlite
      .query('UPDATE ritual_schedule SET last_failure = ?1 WHERE id = 1')
      .run(detail.slice(0, 2_000))
  }
}

function parseWeekdays(value: string): number[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) &&
      parsed.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      ? [...new Set(parsed)]
      : DEFAULT_SCHEDULE.weekdays
  } catch {
    return DEFAULT_SCHEDULE.weekdays
  }
}

function validateSchedule(schedule: RitualSchedule): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: schedule.timezone }).format()
  } catch {
    throw new Error('ritual_schedule_timezone_invalid')
  }
  if (
    !Number.isInteger(schedule.startMinutes) ||
    !Number.isInteger(schedule.endMinutes) ||
    schedule.startMinutes < 0 ||
    schedule.startMinutes > 1_439 ||
    schedule.endMinutes < 0 ||
    schedule.endMinutes > 1_439 ||
    schedule.weekdays.length === 0 ||
    !schedule.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  ) {
    throw new Error('ritual_schedule_invalid')
  }
}
