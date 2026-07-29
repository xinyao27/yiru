import type { ContributionMetric, ContributionPoint } from '@yiru/workbench-model/ui'
import { useMemo } from 'react'

import { AreaChart } from '@/components/dither-kit/area-chart'
import { BarChart } from '@/components/dither-kit/bar-chart'
import { translate } from '@/i18n/i18n'

import { buildContributionTrend, buildWeekdayRhythm } from './chart-data'

export type ContributionChartsProps = {
  metric: ContributionMetric
  points: readonly ContributionPoint[]
}

export function ContributionCharts({ metric, points }: ContributionChartsProps): React.JSX.Element {
  const trend = useMemo(() => buildContributionTrend(points), [points])
  const weekdayRhythm = useMemo(() => buildWeekdayRhythm(points), [points])
  const formatValue = (value: number): string => formatMetricValue(value, metric)

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="border-border bg-card border p-4">
        <h2 className="text-foreground text-sm font-semibold">
          {translate('auto.components.home.charts.trendTitle', '30-day momentum')}
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          {translate(
            'auto.components.home.charts.trendDescription',
            'Daily pace makes accelerations and quiet stretches visible.'
          )}
        </p>
        <div className="mt-4">
          <AreaChart
            ariaLabel={translate(
              'auto.components.home.charts.trendAriaLabel',
              'Daily contributions over the past 30 days'
            )}
            data={trend}
            formatValue={formatValue}
          />
        </div>
      </section>

      <section className="border-border bg-card border p-4">
        <h2 className="text-foreground text-sm font-semibold">
          {translate('auto.components.home.charts.rhythmTitle', 'Weekly rhythm')}
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          {translate(
            'auto.components.home.charts.rhythmDescription',
            'Past-year totals reveal which days carry the most work.'
          )}
        </p>
        <div className="mt-4">
          <BarChart
            ariaLabel={translate(
              'auto.components.home.charts.rhythmAriaLabel',
              'Contributions grouped by weekday over the past year'
            )}
            data={weekdayRhythm}
            formatValue={formatValue}
          />
        </div>
      </section>
    </div>
  )
}

function formatMetricValue(value: number, metric: ContributionMetric): string {
  if (metric === 'activity') {
    return translate('auto.components.home.charts.activities', '{{value0}} activities', {
      value0: value.toLocaleString()
    })
  }
  return translate('auto.components.home.charts.tokens', '{{value0}} tokens', {
    value0: Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value)
  })
}
