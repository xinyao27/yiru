import type { ContributionMetric } from '@yiru/workbench-model/ui'

export type ContributionDisplayMetric = ContributionMetric | 'value'
export type TokenValueMetric = Exclude<ContributionDisplayMetric, 'activity'>

export function nextTokenValueMetric(metric: ContributionDisplayMetric): TokenValueMetric {
  return metric === 'tokens' ? 'value' : 'tokens'
}
