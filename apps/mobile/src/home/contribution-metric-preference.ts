import AsyncStorage from '@react-native-async-storage/async-storage'

import type { ContributionDisplayMetric } from './chart-data'

const STORAGE_KEY = 'yiru:contribution-metric:v1'

let currentMetric: ContributionDisplayMetric = 'activity'
let loadStarted = false
const listeners = new Set<() => void>()

export function subscribeContributionMetric(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getContributionMetric(): ContributionDisplayMetric {
  return currentMetric
}

export function loadContributionMetric(): void {
  if (loadStarted) {
    return
  }
  loadStarted = true
  void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
    if ((stored === 'tokens' || stored === 'value') && currentMetric !== stored) {
      currentMetric = stored
      notifyListeners()
    }
  })
}

export function setContributionMetric(metric: ContributionDisplayMetric): void {
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
