import type { RuntimeStatsSummary } from '@yiru/runtime-protocol/mobile-runtime-types'

import { recordValue } from '../stats-payload-record'

export function parseSupplementalUsage(
  value: unknown
): RuntimeStatsSummary['supplementalUsage'] | undefined {
  const record = recordValue(value)
  if (!record || !Array.isArray(record.dailyTokens) || !Array.isArray(record.modelUsage)) {
    return undefined
  }
  const dailyTokens = record.dailyTokens.flatMap((entry) => {
    const item = recordValue(entry)
    return item &&
      typeof item.day === 'string' &&
      typeof item.tokens === 'number' &&
      (item.valueUsd === null || typeof item.valueUsd === 'number') &&
      typeof item.unpricedTokens === 'number'
      ? [
          {
            day: item.day,
            tokens: item.tokens,
            valueUsd: item.valueUsd,
            unpricedTokens: item.unpricedTokens
          }
        ]
      : []
  })
  const modelUsage = record.modelUsage.flatMap((entry) => {
    const item = recordValue(entry)
    return item &&
      typeof item.key === 'string' &&
      typeof item.label === 'string' &&
      typeof item.tokens === 'number' &&
      (item.valueUsd === null || typeof item.valueUsd === 'number')
      ? [
          {
            key: item.key,
            label: item.label,
            tokens: item.tokens,
            valueUsd: item.valueUsd
          }
        ]
      : []
  })
  const meteredValueUsd = parseOptionalMeteredValue(record.meteredValueUsd)
  return {
    dailyTokens,
    modelUsage,
    ...(meteredValueUsd === undefined ? {} : { meteredValueUsd })
  }
}

export function aggregateSupplementalUsage(
  summaries: readonly RuntimeStatsSummary[]
): RuntimeStatsSummary['supplementalUsage'] | undefined {
  const dailyTokens = [] as NonNullable<RuntimeStatsSummary['supplementalUsage']>['dailyTokens']
  const modelUsage = [] as NonNullable<RuntimeStatsSummary['supplementalUsage']>['modelUsage']
  let meteredValueUsd: number | null | undefined
  let hasSupplementalUsage = false
  for (const summary of summaries) {
    const usage = summary.supplementalUsage
    if (!usage) {
      continue
    }
    hasSupplementalUsage = true
    dailyTokens.push(...usage.dailyTokens)
    modelUsage.push(...usage.modelUsage)
    meteredValueUsd = mergeMeteredValue(meteredValueUsd, usage.meteredValueUsd)
  }
  if (!hasSupplementalUsage) {
    return undefined
  }
  return {
    dailyTokens,
    modelUsage,
    ...(meteredValueUsd === undefined ? {} : { meteredValueUsd })
  }
}

function mergeMeteredValue(
  left: number | null | undefined,
  right: number | null | undefined
): number | null | undefined {
  if (left === undefined) {
    return right
  }
  if (right === undefined) {
    return left
  }
  if (left === null || right === null) {
    return null
  }
  return left + right
}

function parseOptionalMeteredValue(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
