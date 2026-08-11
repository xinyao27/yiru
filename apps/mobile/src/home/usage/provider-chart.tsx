import type {
  RuntimeStatsDailyProviderUsage,
  RuntimeStatsProviderUsage,
  RuntimeStatsUsageProvider
} from '@yiru/runtime-protocol/mobile-runtime-types'
import {
  localUsageDayKey,
  type StatsUsageBoundedRange,
  statsUsageRangeDays
} from '@yiru/runtime-protocol/stats-usage-range'
import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { useCSSVariable } from 'uniwind'

import { MobileContentSection } from '~/components/content-section'
import { translate } from '~/i18n/translate'
import { resolveCssString } from '~/style/resolve-css-variable'

import { formatMetricValue, nextTokenValueMetric, type TokenValueMetric } from '../chart-data'
import { HOME_USAGE_PROVIDERS, providerLabel, providerOpacity } from './provider-presentation'

const CHART_WIDTH = 320
const CHART_HEIGHT = 120
const BAR_GAP_RATIO = 0.2

type ProviderUsageChartProps = {
  daily: readonly RuntimeStatsDailyProviderUsage[]
  metric: TokenValueMetric
  range: StatsUsageBoundedRange
  onMetricChange: (metric: TokenValueMetric) => void
}

type ProviderTrendPoint = {
  day: string
  label: string
  providers: readonly RuntimeStatsProviderUsage[]
}

export function ProviderUsageChart({
  daily,
  metric,
  range,
  onMetricChange
}: ProviderUsageChartProps): React.JSX.Element {
  const trend = useMemo(() => buildProviderTrend(daily, range), [daily, range])
  const nextMetric = nextTokenValueMetric(metric)
  const edgeLabels = [trend[0]?.label ?? '', trend[trend.length - 1]?.label ?? '']

  return (
    <MobileContentSection className="mb-4 p-4">
      <Text className="text-foreground text-sm font-semibold">
        {translate('mobile.home.providerChart.title', 'Daily usage')}
      </Text>
      <Text className="text-muted-foreground mt-1 text-xs">
        {metric === 'tokens'
          ? translate(
              'mobile.home.providerChart.tokenDescription',
              'Token volume by provider across the selected range.'
            )
          : translate(
              'mobile.home.providerChart.valueDescription',
              'Known API-equivalent value by provider; unpriced usage is excluded.'
            )}
      </Text>

      <Pressable
        accessibilityLabel={translate(
          'mobile.home.providerChart.showMetric',
          'Daily usage by provider. Show {{metric}}.',
          { metric: metricLabel(nextMetric) }
        )}
        accessibilityRole="button"
        className="active:bg-accent mt-3 rounded-2xl"
        onPress={() => onMetricChange(nextMetric)}
      >
        <StackedBars metric={metric} points={trend} />
        <View className="mt-2 flex-row justify-between">
          {edgeLabels.map((label, index) => (
            <Text key={`${index}-${label}`} className="text-muted-foreground text-[11px]">
              {label}
            </Text>
          ))}
        </View>
      </Pressable>

      <View className="border-border mt-3 border-t pt-2">
        {HOME_USAGE_PROVIDERS.map((provider) => (
          <ProviderLegendRow key={provider} daily={trend} metric={metric} provider={provider} />
        ))}
      </View>
    </MobileContentSection>
  )
}

function StackedBars({
  metric,
  points
}: {
  metric: TokenValueMetric
  points: readonly ProviderTrendPoint[]
}): React.JSX.Element {
  const chartColor = resolveCssString(useCSSVariable('--color-muted-foreground'))
  const step = CHART_WIDTH / Math.max(1, points.length)
  const barWidth = Math.max(1, step * (1 - BAR_GAP_RATIO))
  const maximum = Math.max(
    1,
    ...points.map((point) => point.providers.reduce((sum, u) => sum + providerMetric(u, metric), 0))
  )

  return (
    <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
      {points.map((point, index) => {
        let floor = CHART_HEIGHT
        return HOME_USAGE_PROVIDERS.map((provider) => {
          const value = providerMetric(findProvider(point.providers, provider), metric)
          const height = (Math.max(0, value) / maximum) * CHART_HEIGHT
          const y = floor - height
          floor = y
          if (height <= 0) {
            return null
          }
          return (
            <Rect
              key={`${point.day}-${provider}`}
              x={index * step + (step - barWidth) / 2}
              y={y}
              width={barWidth}
              height={height}
              fill={chartColor}
              fillOpacity={providerOpacity(provider)}
            />
          )
        })
      })}
    </Svg>
  )
}

function ProviderLegendRow({
  daily,
  metric,
  provider
}: {
  daily: readonly ProviderTrendPoint[]
  metric: TokenValueMetric
  provider: RuntimeStatsUsageProvider
}): React.JSX.Element {
  const chartColor = resolveCssString(useCSSVariable('--color-muted-foreground'))
  const total = daily.reduce(
    (sum, point) => sum + providerMetric(findProvider(point.providers, provider), metric),
    0
  )

  return (
    <View className="min-h-8 flex-row items-center gap-2 py-1">
      <View
        className="size-2.5"
        style={{ backgroundColor: chartColor, opacity: providerOpacity(provider) }}
      />
      <Text className="text-foreground min-w-0 flex-1 text-xs" numberOfLines={1}>
        {providerLabel(provider)}
      </Text>
      <Text className="text-muted-foreground text-xs tabular-nums">
        {formatMetricValue(total, metric)}
      </Text>
    </View>
  )
}

function buildProviderTrend(
  daily: readonly RuntimeStatsDailyProviderUsage[],
  range: StatsUsageBoundedRange,
  now = new Date()
): ProviderTrendPoint[] {
  const byDay = new Map(daily.map((point) => [point.day, point.providers]))
  const anchor = new Date(now)
  anchor.setHours(0, 0, 0, 0)
  const points: ProviderTrendPoint[] = []
  for (let offset = statsUsageRangeDays(range) - 1; offset >= 0; offset--) {
    const date = new Date(anchor)
    date.setDate(date.getDate() - offset)
    const day = localUsageDayKey(date)
    points.push({
      day,
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      providers: byDay.get(day) ?? []
    })
  }
  return points
}

function findProvider(
  providers: readonly RuntimeStatsProviderUsage[],
  provider: RuntimeStatsUsageProvider
): RuntimeStatsProviderUsage | undefined {
  return providers.find((usage) => usage.provider === provider)
}

function providerMetric(
  usage: RuntimeStatsProviderUsage | undefined,
  metric: TokenValueMetric
): number {
  if (!usage) {
    return 0
  }
  return metric === 'tokens' ? usage.tokens : (usage.valueUsd ?? 0)
}

function metricLabel(metric: TokenValueMetric): string {
  return metric === 'tokens'
    ? translate('mobile.home.tokens', 'tokens')
    : translate('mobile.home.apiValue', 'API value')
}
