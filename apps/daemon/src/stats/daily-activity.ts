import { localCalendarDayKey } from '@yiru/runtime-protocol/model/ui'

import type { StatsDailyActivity, StatsEvent } from './types'

export function addEventToDailyActivity(
  dailyActivity: StatsDailyActivity[],
  event: StatsEvent
): void {
  if (event.type === 'agent_stop') {
    return
  }
  const day = localCalendarDayKey(event.at)
  let entry = dailyActivity.find((candidate) => candidate.day === day)
  if (!entry) {
    entry = { day, agentStarts: 0, prsCreated: 0 }
    dailyActivity.push(entry)
    dailyActivity.sort((left, right) => left.day.localeCompare(right.day))
  }
  if (event.type === 'agent_start') {
    entry.agentStarts++
  } else {
    entry.prsCreated++
  }
}

export function buildDailyActivity(events: StatsEvent[]): StatsDailyActivity[] {
  const dailyActivity: StatsDailyActivity[] = []
  for (const event of events) {
    addEventToDailyActivity(dailyActivity, event)
  }
  return dailyActivity
}
