import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  isStatsUsageBoundedRange,
  type StatsUsageBoundedRange
} from '@yiru/runtime-protocol/stats-usage-range'

const STORAGE_KEY = 'yiru:home-usage-range:v1'
const DEFAULT_USAGE_RANGE: StatsUsageBoundedRange = '30d'

let currentRange: StatsUsageBoundedRange = DEFAULT_USAGE_RANGE
let loadPromise: Promise<void> | null = null
const listeners = new Set<() => void>()

export function subscribeUsageRange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getUsageRange(): StatsUsageBoundedRange {
  return currentRange
}

// Why: every screen that reads stats must ask the host for the same window, so
// callers await the stored preference instead of racing the default range.
export async function ensureUsageRange(): Promise<StatsUsageBoundedRange> {
  loadPromise ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((stored) => {
      if (isStatsUsageBoundedRange(stored) && currentRange !== stored) {
        currentRange = stored
        notifyListeners()
      }
    })
    .catch(() => {})
  await loadPromise
  return currentRange
}

export function setUsageRange(range: StatsUsageBoundedRange): void {
  if (currentRange === range) {
    return
  }
  currentRange = range
  notifyListeners()
  void AsyncStorage.setItem(STORAGE_KEY, range).catch(() => {})
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener()
  }
}
