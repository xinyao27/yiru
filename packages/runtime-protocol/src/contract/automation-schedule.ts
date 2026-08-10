import { isClipboardTextByteLengthOverLimit } from '@yiru/workbench-model/ui'

const DAY_MS = 24 * 60 * 60 * 1000
// Why: valid cron expressions like Feb 29 can have an eight-year gap across centuries.
const CRON_SCAN_DAYS = 9 * 366
const AUTOMATION_CRON_EXPRESSION_MAX_BYTES = 2 * 1024

type ParsedRrule = {
  kind: 'rrule'
  freq: 'HOURLY' | 'DAILY' | 'WEEKLY'
  byDay: string[]
  byHour: number
  byMinute: number
}

type ParsedCron = {
  kind: 'cron'
  minutes: Set<number>
  hours: Set<number>
  daysOfMonth: Set<number>
  months: Set<number>
  daysOfWeek: Set<number>
  dayOfMonthRestricted: boolean
  dayOfWeekRestricted: boolean
}

type ParsedSchedule = ParsedRrule | ParsedCron

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
const MONTH_NAMES = new Map([
  ['JAN', 1],
  ['FEB', 2],
  ['MAR', 3],
  ['APR', 4],
  ['MAY', 5],
  ['JUN', 6],
  ['JUL', 7],
  ['AUG', 8],
  ['SEP', 9],
  ['OCT', 10],
  ['NOV', 11],
  ['DEC', 12]
])
const DAY_NAMES = new Map<string, number>([
  ...DAY_CODES.map((code, index) => [code, index] as const),
  ['SUN', 0],
  ['MON', 1],
  ['TUE', 2],
  ['WED', 3],
  ['THU', 4],
  ['FRI', 5],
  ['SAT', 6]
])

function parseRrule(rrule: string): ParsedRrule {
  const entries = new Map<string, string>()
  for (const part of rrule.split(';')) {
    const [key, value] = part.split('=')
    if (key && value) {
      entries.set(key.toUpperCase(), value)
    }
  }
  const freq = entries.get('FREQ')
  if (freq !== 'HOURLY' && freq !== 'DAILY' && freq !== 'WEEKLY') {
    throw new Error('Unsupported automation recurrence.')
  }
  const byHour = Number(entries.get('BYHOUR') ?? '9')
  const byMinute = Number(entries.get('BYMINUTE') ?? '0')
  if (!Number.isInteger(byHour) || byHour < 0 || byHour > 23) {
    throw new Error('Invalid recurrence hour.')
  }
  if (!Number.isInteger(byMinute) || byMinute < 0 || byMinute > 59) {
    throw new Error('Invalid recurrence minute.')
  }
  const byDay = (entries.get('BYDAY') ?? '').split(',').filter(Boolean)
  if (
    freq === 'WEEKLY' &&
    (byDay.length === 0 ||
      byDay.some((day) => !DAY_CODES.includes(day as (typeof DAY_CODES)[number])))
  ) {
    throw new Error('Invalid recurrence day.')
  }
  return { kind: 'rrule', freq, byDay, byHour, byMinute }
}

function parseCronNumber(value: string, names: Map<string, number> | null, field: string): number {
  const normalized = value.toUpperCase()
  const parsed = names?.get(normalized) ?? Number(normalized)
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid cron ${field}.`)
  }
  return parsed
}

function parseCronField(args: {
  value: string
  min: number
  max: number
  field: string
  names?: Map<string, number>
  normalize?: (value: number) => number
}): Set<number> {
  const result = new Set<number>()
  for (const rawPart of args.value.split(',')) {
    const part = rawPart.trim()
    if (!part) {
      throw new Error(`Invalid cron ${args.field}.`)
    }
    const stepParts = part.split('/')
    if (stepParts.length > 2) {
      throw new Error(`Invalid cron ${args.field}.`)
    }
    const [rangePart, stepPart] = stepParts
    if (!rangePart) {
      throw new Error(`Invalid cron ${args.field}.`)
    }
    const step = stepPart === undefined ? 1 : Number(stepPart)
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Invalid cron ${args.field}.`)
    }

    let start: number
    let end: number
    if (rangePart === '*') {
      start = args.min
      end = args.max
    } else if (rangePart.includes('-')) {
      const rangeParts = rangePart.split('-')
      if (rangeParts.length !== 2 || !rangeParts[0] || !rangeParts[1]) {
        throw new Error(`Invalid cron ${args.field}.`)
      }
      start = parseCronNumber(rangeParts[0], args.names ?? null, args.field)
      end = parseCronNumber(rangeParts[1], args.names ?? null, args.field)
    } else {
      start = parseCronNumber(rangePart, args.names ?? null, args.field)
      end = start
    }

    const normalizedStart = args.normalize?.(start) ?? start
    const normalizedEnd = args.normalize?.(end) ?? end
    if (
      start < args.min ||
      start > args.max ||
      end < args.min ||
      end > args.max ||
      normalizedStart < args.min ||
      normalizedStart > args.max ||
      normalizedEnd < args.min ||
      normalizedEnd > args.max ||
      start > end
    ) {
      throw new Error(`Invalid cron ${args.field}.`)
    }
    for (let value = start; value <= end; value += step) {
      result.add(args.normalize?.(value) ?? value)
    }
  }
  if (result.size === 0) {
    throw new Error(`Invalid cron ${args.field}.`)
  }
  return result
}

function cronExpressionFields(expression: string, maxFields: number): string[] {
  if (isClipboardTextByteLengthOverLimit(expression, AUTOMATION_CRON_EXPRESSION_MAX_BYTES)) {
    return []
  }
  const fields: string[] = []
  let tokenStart = -1
  for (let index = 0; index <= expression.length; index += 1) {
    const isEnd = index === expression.length
    if (!isEnd && !isCronWhitespace(expression.charCodeAt(index))) {
      if (tokenStart === -1) {
        tokenStart = index
      }
      continue
    }
    if (tokenStart !== -1) {
      fields.push(expression.slice(tokenStart, index))
      tokenStart = -1
      if (fields.length >= maxFields) {
        break
      }
    }
  }
  return fields
}

function isCronWhitespace(code: number): boolean {
  return (
    code === 32 ||
    (code >= 9 && code <= 13) ||
    code === 160 ||
    code === 5760 ||
    (code >= 8192 && code <= 8202) ||
    code === 8232 ||
    code === 8233 ||
    code === 8239 ||
    code === 8287 ||
    code === 12288 ||
    code === 65279
  )
}

function parseCronExpression(expression: string): ParsedCron {
  const parts = cronExpressionFields(expression, 6)
  if (parts.length !== 5) {
    throw new Error('Cron schedule must have five fields.')
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
  const daysOfMonth = parseCronField({ value: dayOfMonth, min: 1, max: 31, field: 'day of month' })
  const daysOfWeek = parseCronField({
    value: dayOfWeek,
    min: 0,
    max: 7,
    field: 'day of week',
    names: DAY_NAMES,
    normalize: (value) => (value === 7 ? 0 : value)
  })
  return {
    kind: 'cron',
    minutes: parseCronField({ value: minute, min: 0, max: 59, field: 'minute' }),
    hours: parseCronField({ value: hour, min: 0, max: 23, field: 'hour' }),
    daysOfMonth,
    months: parseCronField({ value: month, min: 1, max: 12, field: 'month', names: MONTH_NAMES }),
    daysOfWeek,
    dayOfMonthRestricted: daysOfMonth.size !== 31,
    dayOfWeekRestricted: daysOfWeek.size !== 7
  }
}

function cronDateMatches(rule: ParsedCron, timestamp: number): boolean {
  const date = new Date(timestamp)
  if (!rule.months.has(date.getMonth() + 1)) {
    return false
  }
  const dayOfMonthMatches = rule.daysOfMonth.has(date.getDate())
  const dayOfWeekMatches = rule.daysOfWeek.has(date.getDay())
  return rule.dayOfMonthRestricted && rule.dayOfWeekRestricted
    ? dayOfMonthMatches || dayOfWeekMatches
    : dayOfMonthMatches && dayOfWeekMatches
}

function cronHasPossibleOccurrence(rule: ParsedCron, anchor: number): boolean {
  const date = new Date(anchor)
  date.setHours(0, 0, 0, 0)
  let day = date.getTime()
  for (let index = 0; index < CRON_SCAN_DAYS; index += 1) {
    if (cronDateMatches(rule, day)) {
      return true
    }
    day += DAY_MS
  }
  return false
}

export function isValidAutomationSchedule(schedule: string): boolean {
  try {
    const trimmed = schedule.trim()
    const parsed: ParsedSchedule = trimmed.includes('=')
      ? parseRrule(trimmed)
      : parseCronExpression(trimmed)
    return parsed.kind !== 'cron' || cronHasPossibleOccurrence(parsed, Date.now())
  } catch {
    return false
  }
}
