import type { ContributionDisplayMetric } from '~renderer/components/contribution-heatmap/metric'
import { nextTokenValueMetric } from '~renderer/components/contribution-heatmap/metric'
import { translate } from '~renderer/i18n/i18n'

export function chartActivationLabel(
  chartLabel: string,
  metric: ContributionDisplayMetric
): string {
  return translate(
    'auto.components.home.charts.activationLabel',
    '{{value0}}. Click to show {{value1}}.',
    { value0: chartLabel, value1: metricLabel(nextTokenValueMetric(metric)) }
  )
}

function metricLabel(metric: ContributionDisplayMetric): string {
  switch (metric) {
    case 'activity':
      return translate('auto.components.home.page.activity', 'Activity')
    case 'tokens':
      return translate('auto.components.home.page.tokens', 'Tokens')
    case 'value':
      return translate('auto.components.home.page.apiValue', 'API value')
  }
}
