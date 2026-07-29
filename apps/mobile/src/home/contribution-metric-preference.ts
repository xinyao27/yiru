import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ContributionMetric } from '@yiru/workbench-model/ui'

const STORAGE_KEY = 'yiru:contribution-metric:v1'

let currentMetric: ContributionMetric = 'activity'
let loadStarted = false
const listeners = new Set<() => void>()

export function subscribeContributionMetric(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getContributionMetric(): ContributionMetric {
  return currentMetric
}

export function loadContributionMetric(): void {
  if (loadStarted) {
    return
  }
  loadStarted = true
  void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
    if (stored === 'tokens' && currentMetric !== 'tokens') {
      currentMetric = 'tokens'
      notifyListeners()
    }
  })
}

export function setContributionMetric(metric: ContributionMetric): void {
  if (currentMetric === metric) {
    return
  }
  currentMetric = metric
  notifyListeners()
  void AsyncStorage.setItem(STORAGE_KEY, metric).catch(() => {})
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener()
  }
}
