export type WallClockDateParts = {
  year: number
  monthIndex: number
  day: number
  hour: number
  minute: number
}

export function buildWallClockTimestamp(
  parts: WallClockDateParts,
  timeZone: string | null
): number | null {
  if (!timeZone) {
    const localDate = new Date(parts.year, parts.monthIndex, parts.day, parts.hour, parts.minute)
    return isMatchingDateParts(localDate, parts) ? localDate.getTime() : null
  }

  const timestamp = buildTimeZoneTimestamp(parts, timeZone)
  if (timestamp === null) {
    return null
  }
  const resolvedParts = getTimeZoneDateParts(timestamp, timeZone)
  return resolvedParts && areMatchingWallClockParts(resolvedParts, parts) ? timestamp : null
}

export type WallClockCalendarDate = Pick<WallClockDateParts, 'year' | 'monthIndex' | 'day'>

/**
 * The calendar date in effect at `timestamp` in `timeZone` (the local date when
 * the zone is absent or unresolvable). Callers pairing a bare clock time with
 * "today" need the day as the reset's own zone sees it, not as this machine does.
 */
export function getWallClockCalendarDate(
  timestamp: number,
  timeZone: string | null
): WallClockCalendarDate {
  const zoned = timeZone ? getTimeZoneDateParts(timestamp, timeZone) : null
  if (zoned) {
    return { year: zoned.year, monthIndex: zoned.monthIndex, day: zoned.day }
  }
  const local = new Date(timestamp)
  return { year: local.getFullYear(), monthIndex: local.getMonth(), day: local.getDate() }
}

/** Same calendar date shifted by whole days, normalized across month/year ends. */
export function addCalendarDays(date: WallClockCalendarDate, days: number): WallClockCalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.monthIndex, date.day + days))
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate()
  }
}

function buildTimeZoneTimestamp(parts: WallClockDateParts, timeZone: string): number | null {
  const utcGuess = Date.UTC(parts.year, parts.monthIndex, parts.day, parts.hour, parts.minute)
  const firstOffset = getTimeZoneOffsetMs(utcGuess, timeZone)
  if (firstOffset === null) {
    return null
  }
  const firstTimestamp = utcGuess - firstOffset
  const secondOffset = getTimeZoneOffsetMs(firstTimestamp, timeZone)
  return secondOffset === null ? null : utcGuess - secondOffset
}

function getTimeZoneOffsetMs(timestamp: number, timeZone: string): number | null {
  const parts = getTimeZoneDateParts(timestamp, timeZone)
  if (!parts) {
    return null
  }
  return Date.UTC(parts.year, parts.monthIndex, parts.day, parts.hour, parts.minute) - timestamp
}

function getTimeZoneDateParts(timestamp: number, timeZone: string): WallClockDateParts | null {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value])
  )
  const year = Number(parts.year)
  const monthIndex = Number(parts.month) - 1
  const day = Number(parts.day)
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)
  return [year, monthIndex, day, hour, minute].every(Number.isFinite)
    ? { year, monthIndex, day, hour, minute }
    : null
}

function isMatchingDateParts(date: Date, parts: WallClockDateParts): boolean {
  return (
    date.getFullYear() === parts.year &&
    date.getMonth() === parts.monthIndex &&
    date.getDate() === parts.day &&
    date.getHours() === parts.hour &&
    date.getMinutes() === parts.minute
  )
}

function areMatchingWallClockParts(left: WallClockDateParts, right: WallClockDateParts): boolean {
  return (
    left.year === right.year &&
    left.monthIndex === right.monthIndex &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  )
}
