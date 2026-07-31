// 24-hour reset wording ("Resets at 04:00 (America/Los_Angeles)").
//
// Why a separate parser: the shared Claude usage parser only accepts a 12-hour
// clock, and widening it there would change what the usage poller reads out of
// a live `/usage` screen. This runs only after that parser declines.

import {
  addCalendarDays,
  buildWallClockTimestamp,
  getWallClockCalendarDate
} from '../rate-limits/time-zone-wall-clock'

const RESET_HINT_RE = /\bresets?\s+(?:at|on)\b/i
// Rejects a trailing am/pm (the shared parser owns that form) and bare ratios
// such as "3/5" by requiring a colon and two-digit minutes.
const TWENTY_FOUR_HOUR_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:am|pm))/i
const PARENTHESIZED_RE = /\(([^()]+)\)/

function timeZoneFrom(line: string): string | null {
  const zone = PARENTHESIZED_RE.exec(line)?.[1]?.trim()
  if (!zone) {
    return null
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch {
    return null
  }
}

/** Epoch ms for the next occurrence of a 24-hour reset time, or null. */
export function parseTwentyFourHourReset(lines: string[]): number | null {
  const now = Date.now()
  for (const line of lines) {
    if (!RESET_HINT_RE.test(line)) {
      continue
    }
    const match = TWENTY_FOUR_HOUR_RE.exec(line)
    if (!match) {
      continue
    }
    const timeZone = timeZoneFrom(line)
    const today = getWallClockCalendarDate(now, timeZone)
    const hour = Number(match[1])
    const minute = Number(match[2])
    const sameDay = buildWallClockTimestamp({ ...today, hour, minute }, timeZone)
    if (sameDay !== null && sameDay > now) {
      return sameDay
    }
    // Already past in that zone — the window rolls at the same time tomorrow.
    return buildWallClockTimestamp({ ...addCalendarDays(today, 1), hour, minute }, timeZone)
  }
  return null
}
