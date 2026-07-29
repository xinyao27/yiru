import type { ContributionPoint } from '@yiru/workbench-model/ui'
import { useMemo } from 'react'

import type {
  ContributionDisplayMetric,
  TokenValueMetric
} from '@/components/contribution-heatmap/metric'
import { nextTokenValueMetric } from '@/components/contribution-heatmap/metric'
import { AreaChart } from '@/components/dither-kit/area-chart'
import { BarChart } from '@/components/dither-kit/bar-chart'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { translate } from '@/i18n/i18n'

import { chartActivationLabel } from './chart-activation'
import { buildContributionTrend, buildWeekdayRhythm } from './chart-data'

export type ContributionChartsProps = {
  metric: ContributionDisplayMetric
  points: readonly ContributionPoint[]
  onMetricChange: (metric: TokenValueMetric) => void
}

export function ContributionCharts({
  metric,
  points,
  onMetricChange
}: ContributionChartsProps): React.JSX.Element {
  const trend = useMemo(() => buildContributionTrend(points), [points])
  const weekdayRhythm = useMemo(() => buildWeekdayRhythm(points), [points])
  const formatValue = (value: number): string => formatMetricValue(value, metric)

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card size="compact">
        <CardHeader>
          <div>
            <h2 className="text-foreground text-sm font-semibold">
              {translate('auto.components.home.charts.trendTitle', '30-day momentum')}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {translate(
                'auto.components.home.charts.trendDescription',
                'Daily pace makes accelerations and quiet stretches visible.'
              )}
            </p>
          </div>
        </CardHeader>
        <CardContent className="mt-4">
          <AreaChart
            ariaLabel={chartActivationLabel(
              translate(
                'auto.components.home.charts.trendAriaLabel',
                'Daily contributions over the past 30 days'
              ),
              metric
            )}
            data={trend}
            formatValue={formatValue}
            onActivate={() => onMetricChange(nextTokenValueMetric(metric))}
          />
        </CardContent>
      </Card>

      <Card size="compact">
        <CardHeader>
          <div>
            <h2 className="text-foreground text-sm font-semibold">
              {translate('auto.components.home.charts.rhythmTitle', 'Weekly rhythm')}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {translate(
                'auto.components.home.charts.rhythmDescription',
                'Past-year totals reveal which days carry the most work.'
              )}
            </p>
          </div>
        </CardHeader>
        <CardContent className="mt-4">
          <BarChart
            ariaLabel={chartActivationLabel(
              translate(
                'auto.components.home.charts.rhythmAriaLabel',
                'Contributions grouped by weekday over the past year'
              ),
              metric
            )}
            data={weekdayRhythm}
            formatValue={formatValue}
            onActivate={() => onMetricChange(nextTokenValueMetric(metric))}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function formatMetricValue(value: number, metric: ContributionDisplayMetric): string {
  switch (metric) {
    case 'activity':
      return translate('auto.components.home.charts.activities', '{{value0}} activities', {
        value0: value.toLocaleString()
      })
    case 'tokens':
      return translate('auto.components.home.charts.tokens', '{{value0}} tokens', {
        value0: Intl.NumberFormat(undefined, {
          notation: 'compact',
          maximumFractionDigits: 1
        }).format(value)
      })
    case 'value':
      return translate('auto.components.home.charts.value', '{{value0}} API value', {
        value0: Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          maximumFractionDigits: 1
        }).format(value)
      })
  }
}
