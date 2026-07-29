import type { ContributionPoint } from '@yiru/workbench-model/ui'
import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg'

import { translate } from '../i18n/translate'
import { useThemeColors } from '../theme/uniwind-theme-values'
import {
  buildContributionTrend,
  buildWeekdayRhythm,
  type ContributionDisplayMetric,
  formatMetricValue,
  nextTokenValueMetric,
  type TokenValueMetric
} from './chart-data'

const CHART_WIDTH = 320
const CHART_HEIGHT = 132
const PLOT_TOP = 8
const PLOT_BOTTOM = 116

type ContributionChartsProps = {
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
  const rhythm = useMemo(() => buildWeekdayRhythm(points), [points])
  const nextMetric = nextTokenValueMetric(metric)

  return (
    <View className="mb-4 gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={chartActivationLabel(
          translate('mobile.home.trend.title', '30-day momentum'),
          nextMetric
        )}
        className="border-hairline border-border bg-card active:bg-accent p-4"
        onPress={() => onMetricChange(nextMetric)}
      >
        <Text className="text-foreground text-sm font-semibold">
          {translate('mobile.home.trend.title', '30-day momentum')}
        </Text>
        <Text className="text-muted-foreground mt-1 text-xs">
          {translate(
            'mobile.home.trend.description',
            'Daily pace makes accelerations and quiet stretches visible.'
          )}
        </Text>
        <View className="mt-4">
          <AreaPlot points={trend.map((point) => point.value)} />
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={chartActivationLabel(
          translate('mobile.home.rhythm.title', 'Weekly rhythm'),
          nextMetric
        )}
        className="border-hairline border-border bg-card active:bg-accent p-4"
        onPress={() => onMetricChange(nextMetric)}
      >
        <Text className="text-foreground text-sm font-semibold">
          {translate('mobile.home.rhythm.title', 'Weekly rhythm')}
        </Text>
        <Text className="text-muted-foreground mt-1 text-xs">
          {translate(
            'mobile.home.rhythm.description',
            'Past-year totals reveal which days carry the most work.'
          )}
        </Text>
        <View className="mt-4 h-[132px] flex-row items-end gap-2">
          {rhythm.map((point) => (
            <View key={point.label} className="h-full flex-1 items-center justify-end">
              <Text className="text-muted-foreground mb-1 text-[10px]" numberOfLines={1}>
                {formatMetricValue(point.value, metric)}
              </Text>
              <View
                className="bg-chart-1 w-full"
                style={{
                  height: `${barHeight(
                    point.value,
                    rhythm.map((entry) => entry.value)
                  )}%`
                }}
              />
              <Text className="text-muted-foreground mt-2 text-[11px]">{point.label}</Text>
            </View>
          ))}
        </View>
      </Pressable>
    </View>
  )
}

function AreaPlot({ points }: { points: number[] }): React.JSX.Element {
  const colors = useThemeColors()
  const coordinates = chartCoordinates(points)
  const linePath = coordinates
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`)
    .join(' ')
  const areaPath = `${linePath} L${CHART_WIDTH} ${PLOT_BOTTOM} L0 ${PLOT_BOTTOM} Z`

  return (
    <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
      <Defs>
        <LinearGradient id="homeTrendFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.chart1} stopOpacity={0.34} />
          <Stop offset="1" stopColor={colors.chart1} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      {[0, 1, 2, 3].map((line) => {
        const y = PLOT_TOP + ((PLOT_BOTTOM - PLOT_TOP) * line) / 3
        return (
          <Line
            key={line}
            x1="0"
            x2={CHART_WIDTH}
            y1={y}
            y2={y}
            stroke={colors.borderSubtle}
            strokeWidth="1"
          />
        )
      })}
      <Path d={areaPath} fill="url(#homeTrendFill)" />
      <Path d={linePath} fill="none" stroke={colors.chart1} strokeWidth="2" />
    </Svg>
  )
}

function chartCoordinates(points: number[]): [number, number][] {
  const maximum = Math.max(...points, 1)
  const range = PLOT_BOTTOM - PLOT_TOP
  return points.map((value, index) => [
    points.length <= 1 ? 0 : (index / (points.length - 1)) * CHART_WIDTH,
    PLOT_BOTTOM - (value / maximum) * range
  ])
}

function barHeight(value: number, values: number[]): number {
  const maximum = Math.max(...values, 1)
  return Math.max(4, (value / maximum) * 76)
}

function metricLabel(metric: TokenValueMetric): string {
  return metric === 'tokens'
    ? translate('mobile.home.tokens', 'tokens')
    : translate('mobile.home.apiValue', 'API value')
}

function chartActivationLabel(chart: string, metric: TokenValueMetric): string {
  return translate('mobile.home.chart.showMetric', '{{chart}}. Show {{metric}}.', {
    chart,
    metric: metricLabel(metric)
  })
}
