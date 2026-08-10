import { useState } from 'react'

import { isUsageRange, type UsageRange } from './usage-range'

const USAGE_RANGE_STORAGE_KEY = 'yiru.home.usage-range.v1'

type UsageRangePreference = [UsageRange, (range: UsageRange) => void]

export function useUsageRangePreference(): UsageRangePreference {
  const [range, setRange] = useState<UsageRange>(loadUsageRange)
  const selectRange = (nextRange: UsageRange): void => {
    setRange(nextRange)
    try {
      window.localStorage.setItem(USAGE_RANGE_STORAGE_KEY, nextRange)
    } catch {
      // Why: storage can be unavailable; the in-memory range still works.
    }
  }
  return [range, selectRange]
}

function loadUsageRange(): UsageRange {
  try {
    const stored = window.localStorage.getItem(USAGE_RANGE_STORAGE_KEY)
    return isUsageRange(stored) ? stored : '30d'
  } catch {
    return '30d'
  }
}
