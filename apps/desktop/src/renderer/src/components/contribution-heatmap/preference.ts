import type { ContributionMetric } from '@yiru/workbench-model/ui'

const CONTRIBUTION_METRIC_STORAGE_KEY = 'yiru:contribution-metric:v1'

export function loadContributionMetric(): ContributionMetric {
  try {
    return window.localStorage.getItem(CONTRIBUTION_METRIC_STORAGE_KEY) === 'tokens'
      ? 'tokens'
      : 'activity'
  } catch {
    return 'activity'
  }
}

export function saveContributionMetric(metric: ContributionMetric): void {
  try {
    window.localStorage.setItem(CONTRIBUTION_METRIC_STORAGE_KEY, metric)
  } catch {
    // Why: storage can be disabled while the in-memory selection remains usable.
  }
}
