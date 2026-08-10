import type { ContributionDisplayMetric } from '~renderer/components/contribution-heatmap/metric'
import { ToggleGroup, ToggleGroupItem } from '~renderer/components/ui/toggle-group'
import { translate } from '~renderer/i18n/i18n'

import type { UsageRange } from './usage-range'

type MetricControlsProps = {
  metric: ContributionDisplayMetric
  range: UsageRange
  onMetricChange: (metric: ContributionDisplayMetric) => void
  onRangeChange: (range: UsageRange) => void
}

export function MetricControls({
  metric,
  range,
  onMetricChange,
  onRangeChange
}: MetricControlsProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <ToggleGroup
        variant="outline"
        size="sm"
        value={[metric === 'activity' ? 'activity' : 'tokens']}
        aria-label={translate('auto.components.home.metricControls.metricLabel', 'Statistic')}
        onValueChange={(values) => {
          const nextMetric = values[0]
          if (nextMetric === 'activity' || nextMetric === 'tokens') {
            onMetricChange(nextMetric)
          }
        }}
      >
        <ToggleGroupItem value="activity">
          {translate('auto.components.home.page.activity', 'Activity')}
        </ToggleGroupItem>
        <ToggleGroupItem value="tokens">
          {translate('auto.components.home.page.tokens', 'Tokens')}
        </ToggleGroupItem>
      </ToggleGroup>

      {metric === 'activity' ? null : (
        <ToggleGroup
          variant="outline"
          size="sm"
          value={[range]}
          aria-label={translate('auto.components.home.metricControls.rangeLabel', 'Usage range')}
          onValueChange={(values) => {
            const nextRange = values[0]
            if (nextRange === '7d' || nextRange === '30d' || nextRange === '90d') {
              onRangeChange(nextRange)
            }
          }}
        >
          <ToggleGroupItem value="7d">
            {translate('auto.components.home.metricControls.sevenDays', '7 days')}
          </ToggleGroupItem>
          <ToggleGroupItem value="30d">
            {translate('auto.components.home.metricControls.thirtyDays', '30 days')}
          </ToggleGroupItem>
          <ToggleGroupItem value="90d">
            {translate('auto.components.home.metricControls.ninetyDays', '90 days')}
          </ToggleGroupItem>
        </ToggleGroup>
      )}
    </div>
  )
}
