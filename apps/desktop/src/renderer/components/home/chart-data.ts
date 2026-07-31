import type { ContributionPoint } from '@yiru/workbench-model/ui'
import { localCalendarDayKey } from '@yiru/workbench-model/ui'
import type { DitherChartPoint } from '~renderer/components/dither-kit/canvas-chart'

const TREND_DAY_COUNT = 30
const YEAR_DAY_COUNT = 366
const WEEKDAY_COUNT = 7

export function buildContributionTrend(
  points: readonly ContributionPoint[],
  anchorDate = new Date()
): DitherChartPoint[] {
  const valuesByDay = contributionValuesByDay(points)
  const anchor = startOfLocalDay(anchorDate)
  const trend: DitherChartPoint[] = []
  for (let offset = TREND_DAY_COUNT - 1; offset >= 0; offset--) {
    const date = addLocalDays(anchor, -offset)
    trend.push({
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: valuesByDay.get(localCalendarDayKey(date)) ?? 0
    })
  }
  return trend
}

export function buildWeekdayRhythm(
  points: readonly ContributionPoint[],
  anchorDate = new Date()
): DitherChartPoint[] {
  const valuesByDay = contributionValuesByDay(points)
  const anchor = startOfLocalDay(anchorDate)
  const totals = Array.from({ length: WEEKDAY_COUNT }, () => 0)
  for (let offset = 0; offset < YEAR_DAY_COUNT; offset++) {
    const date = addLocalDays(anchor, -offset)
    totals[date.getDay()] =
      (totals[date.getDay()] ?? 0) + (valuesByDay.get(localCalendarDayKey(date)) ?? 0)
  }
  return totals.map((value, weekday) => ({
    label: new Date(2024, 0, 7 + weekday).toLocaleDateString(undefined, { weekday: 'short' }),
    value
  }))
}

function contributionValuesByDay(points: readonly ContributionPoint[]): Map<string, number> {
  const values = new Map<string, number>()
  for (const point of points) {
    if (Number.isFinite(point.value) && point.value > 0) {
      values.set(point.day, (values.get(point.day) ?? 0) + point.value)
    }
  }
  return values
}

function startOfLocalDay(value: Date): Date {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function addLocalDays(value: Date, amount: number): Date {
  const date = new Date(value)
  date.setDate(date.getDate() + amount)
  return date
}
