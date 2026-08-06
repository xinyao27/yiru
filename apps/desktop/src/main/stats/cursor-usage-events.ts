import type { RuntimeStatsSupplementalUsage } from '@yiru/runtime-protocol/mobile-runtime-types'

export type CursorUsageEvent = {
  timestampMs: number | null
  model: string | null
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  totalCents: number | null
  chargedCents: number | null
}

export type CursorUsagePage = {
  totalUsageEventsCount: number | null
  usageEvents: CursorUsageEvent[]
}

type UsageAccumulator = {
  tokens: number
  knownValueUsd: number
  hasKnownValue: boolean
  unpricedTokens: number
}

export function parseCursorUsagePage(value: unknown): CursorUsagePage {
  const record = recordValue(value)
  if (!record || !Array.isArray(record.usageEventsDisplay)) {
    throw new Error('Cursor usage response has an invalid shape')
  }
  const total = nullableNumber(record.totalUsageEventsCount)
  if (total !== null && (!Number.isInteger(total) || total < 0)) {
    throw new Error('Cursor usage response has an invalid event count')
  }
  return {
    totalUsageEventsCount: total,
    usageEvents: record.usageEventsDisplay.map(
      (entry) => parseCursorUsageEvent(entry) ?? emptyCursorEvent()
    )
  }
}

export function buildCursorUsage(
  events: readonly CursorUsageEvent[]
): RuntimeStatsSupplementalUsage {
  const daily = new Map<string, UsageAccumulator>()
  const models = new Map<string, UsageAccumulator>()
  for (const event of events) {
    if (event.timestampMs === null) {
      continue
    }
    const tokens = cursorTokenTotal(event)
    if (tokens <= 0) {
      continue
    }
    const day = localDay(event.timestampMs)
    const modelName = event.model?.trim() || 'Unknown model'
    const priceUsd =
      event.totalCents !== null && event.totalCents >= 0 ? event.totalCents / 100 : null
    addUsage(daily, day, tokens, priceUsd)
    addUsage(models, modelKey(modelName), tokens, priceUsd)
  }
  return {
    dailyTokens: [...daily.entries()]
      .map(([day, usage]) => ({ day, ...usageValue(usage) }))
      .sort((left, right) => left.day.localeCompare(right.day)),
    modelUsage: [...models.entries()]
      .map(([key, usage]) => ({
        key,
        label: `Cursor · ${key.slice('cursor:'.length)}`,
        ...usageValue(usage)
      }))
      .sort((left, right) => right.tokens - left.tokens),
    meteredValueUsd: meteredCostUsd(events)
  }
}

export function boundaryOverlap(
  previous: readonly CursorUsageEvent[],
  current: readonly CursorUsageEvent[]
): number {
  const limit = Math.min(previous.length, current.length)
  for (let count = limit; count >= 1; count--) {
    const previousSlice = previous.slice(-count)
    const currentSlice = current.slice(0, count)
    if (previousSlice.every((event, index) => sameCursorEvent(event, currentSlice[index]))) {
      return count
    }
  }
  return 0
}

export function emptyCursorUsage(): RuntimeStatsSupplementalUsage {
  return { dailyTokens: [], modelUsage: [] }
}

function parseCursorUsageEvent(value: unknown): CursorUsageEvent | null {
  const record = recordValue(value)
  const tokenUsage = recordValue(record?.tokenUsage)
  if (!record) {
    return null
  }
  const inputTokens = tokenNumber(tokenUsage?.inputTokens)
  const outputTokens = tokenNumber(tokenUsage?.outputTokens)
  const cacheWriteTokens = tokenNumber(tokenUsage?.cacheWriteTokens)
  const cacheReadTokens = tokenNumber(tokenUsage?.cacheReadTokens)
  const timestampMs = integerNumber(record.timestamp)
  return {
    timestampMs: timestampMs && timestampMs > 0 ? timestampMs : null,
    model: stringValue(record.model),
    inputTokens,
    outputTokens,
    cacheWriteTokens,
    cacheReadTokens,
    totalCents: nullableNumber(tokenUsage?.totalCents),
    chargedCents: nullableNumber(record.chargedCents)
  }
}

function cursorTokenTotal(event: CursorUsageEvent): number {
  const tokenValues = [
    event.inputTokens,
    event.outputTokens,
    event.cacheWriteTokens,
    event.cacheReadTokens
  ]
  if (tokenValues.some((value) => !Number.isInteger(value) || value < 0)) {
    return 0
  }
  const total = tokenValues.reduce((sum, value) => sum + value, 0)
  return Number.isSafeInteger(total) ? total : 0
}

function meteredCostUsd(events: readonly CursorUsageEvent[]): number | null {
  let totalCents = 0
  let hasValidEvent = false
  for (const event of events) {
    if (event.timestampMs === null) {
      continue
    }
    hasValidEvent = true
    if (event.chargedCents === null || event.chargedCents < 0) {
      return null
    }
    totalCents += event.chargedCents
    if (!Number.isFinite(totalCents)) {
      return null
    }
  }
  return hasValidEvent ? totalCents / 100 : null
}

function addUsage(
  target: Map<string, UsageAccumulator>,
  key: string,
  tokens: number,
  priceUsd: number | null
): void {
  const current = target.get(key) ?? {
    tokens: 0,
    knownValueUsd: 0,
    hasKnownValue: false,
    unpricedTokens: 0
  }
  current.tokens += tokens
  if (priceUsd === null) {
    current.unpricedTokens += tokens
  } else {
    current.knownValueUsd += priceUsd
    current.hasKnownValue = true
  }
  target.set(key, current)
}

function usageValue(usage: UsageAccumulator): {
  tokens: number
  valueUsd: number | null
  unpricedTokens: number
} {
  return {
    tokens: usage.tokens,
    valueUsd: usage.hasKnownValue && usage.unpricedTokens === 0 ? usage.knownValueUsd : null,
    unpricedTokens: usage.unpricedTokens
  }
}

function modelKey(model: string): string {
  return `cursor:${model.trim().toLowerCase() || 'unknown-model'}`
}

function localDay(timestampMs: number): string {
  const date = new Date(timestampMs)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function sameCursorEvent(left: CursorUsageEvent, right: CursorUsageEvent): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function emptyCursorEvent(): CursorUsageEvent {
  return {
    timestampMs: null,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    totalCents: null,
    chargedCents: null
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function nullableNumber(value: unknown): number | null {
  const parsed = nonNegativeNumber(value)
  return parsed === null ? null : parsed
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function integerNumber(value: unknown): number | null {
  const parsed = nonNegativeNumber(value)
  return parsed !== null && Number.isInteger(parsed) ? parsed : null
}

function tokenNumber(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : 0
}
