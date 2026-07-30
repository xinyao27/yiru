import type { RuntimeStatsModelUsage } from '@yiru/runtime-protocol/mobile-runtime-types'
import { useMemo } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useCSSVariable } from 'uniwind'

import { MobileContentSection } from '../components/content-section'
import { translate } from '../i18n/translate'
import { resolveCssString } from '../style/resolve-css-variable'
import { formatMetricValue, nextTokenValueMetric, type TokenValueMetric } from './chart-data'
import { HomeGlassChartPressable } from './glass-chart-pressable'

const VISIBLE_MODEL_COUNT = 4
const DONUT_SIZE = 168
const DONUT_CENTER = DONUT_SIZE / 2
const DONUT_RADIUS = 55
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS
const SEGMENT_OPACITIES = [1, 0.82, 0.64, 0.46, 0.28] as const

type ModelUsageChartProps = {
  metric: TokenValueMetric
  models: RuntimeStatsModelUsage[]
  onMetricChange: (metric: TokenValueMetric) => void
}

type PiePoint = {
  key: string
  label: string
  value: number
}

export function ModelUsageChart({
  metric,
  models,
  onMetricChange
}: ModelUsageChartProps): React.JSX.Element {
  const [chartValue, borderValue] = useCSSVariable(['--color-muted-foreground', '--color-border'])
  const chartColor = resolveCssString(chartValue)
  const borderColor = resolveCssString(borderValue)
  const data = useMemo(() => buildPieData(models, metric), [metric, models])
  const total = data.reduce((sum, point) => sum + point.value, 0)
  const nextMetric = nextTokenValueMetric(metric)

  return (
    <MobileContentSection className="mb-4 p-4">
      <Text className="text-foreground text-sm font-semibold">
        {translate('mobile.home.modelMix.title', 'Model mix')}
      </Text>
      <Text className="text-muted-foreground mt-1 text-xs">
        {metric === 'tokens'
          ? translate(
              'mobile.home.modelMix.tokenDescription',
              'Token usage attributed to Yiru worktrees, grouped by model.'
            )
          : translate(
              'mobile.home.modelMix.valueDescription',
              'Standard global API-equivalent value for token categories with authoritative pricing.'
            )}
      </Text>

      {data.length > 0 ? (
        <>
          <HomeGlassChartPressable
            accessibilityLabel={activationLabel(nextMetric)}
            className="mt-3 rounded-2xl"
            contentClassName="items-center"
            onPress={() => onMetricChange(nextMetric)}
          >
            <View className="items-center justify-center">
              <Svg
                width={DONUT_SIZE}
                height={DONUT_SIZE}
                viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
              >
                <Circle
                  cx={DONUT_CENTER}
                  cy={DONUT_CENTER}
                  r={DONUT_RADIUS}
                  fill="none"
                  stroke={borderColor}
                  strokeWidth="24"
                />
                {buildSegments(data).map((segment, index) => (
                  <Circle
                    key={segment.key}
                    cx={DONUT_CENTER}
                    cy={DONUT_CENTER}
                    r={DONUT_RADIUS}
                    fill="none"
                    stroke={chartColor}
                    strokeOpacity={SEGMENT_OPACITIES[index % SEGMENT_OPACITIES.length]}
                    strokeWidth="24"
                    strokeDasharray={`${segment.length} ${DONUT_CIRCUMFERENCE - segment.length}`}
                    strokeDashoffset={-segment.offset}
                    strokeLinecap="butt"
                    transform={`rotate(-90 ${DONUT_CENTER} ${DONUT_CENTER})`}
                  />
                ))}
              </Svg>
              <View className="absolute items-center">
                <Text className="text-foreground text-sm font-bold tabular-nums">
                  {formatMetricValue(total, metric)}
                </Text>
                <Text className="text-muted-foreground mt-0.5 text-[11px]">
                  {metric === 'tokens'
                    ? translate('mobile.home.modelMix.totalTokens', 'total tokens')
                    : translate('mobile.home.apiValue', 'API value')}
                </Text>
              </View>
            </View>
          </HomeGlassChartPressable>

          <View className="border-border mt-2 border-t pt-2">
            {data.map((point, index) => (
              <View key={point.key} className="min-h-8 flex-row items-center gap-2 py-1">
                <View
                  className="size-2.5"
                  style={{
                    backgroundColor: chartColor,
                    opacity: SEGMENT_OPACITIES[index % SEGMENT_OPACITIES.length]
                  }}
                />
                <Text className="text-foreground min-w-0 flex-1 text-xs" numberOfLines={1}>
                  {point.label}
                </Text>
                <Text className="text-muted-foreground text-xs tabular-nums">
                  {formatMetricValue(point.value, metric)} · {formatShare(point.value, total)}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <HomeGlassChartPressable
          accessibilityLabel={activationLabel(nextMetric)}
          className="mt-4 rounded-2xl"
          contentClassName="px-4 py-8"
          onPress={() => onMetricChange(nextMetric)}
        >
          <Text className="text-muted-foreground text-center text-xs">
            {metric === 'tokens'
              ? translate(
                  'mobile.home.modelMix.tokensUnavailable',
                  'No model token data is available yet.'
                )
              : translate(
                  'mobile.home.modelMix.valueUnavailable',
                  'No known model pricing is available for comparison yet.'
                )}
          </Text>
        </HomeGlassChartPressable>
      )}
    </MobileContentSection>
  )
}

function buildPieData(models: RuntimeStatsModelUsage[], metric: TokenValueMetric): PiePoint[] {
  const ranked = models
    .map((model) => ({
      key: model.key,
      label: model.label,
      value: metric === 'tokens' ? model.tokens : (model.valueUsd ?? 0)
    }))
    .filter((model) => model.value > 0)
    .sort((left, right) => right.value - left.value)
  const visible = ranked.slice(0, VISIBLE_MODEL_COUNT)
  const remainingValue = ranked
    .slice(VISIBLE_MODEL_COUNT)
    .reduce((sum, model) => sum + model.value, 0)
  return remainingValue > 0
    ? [
        ...visible,
        {
          key: 'other',
          label: translate('mobile.home.modelMix.other', 'Other'),
          value: remainingValue
        }
      ]
    : visible
}

function buildSegments(data: PiePoint[]): (PiePoint & { length: number; offset: number })[] {
  const total = data.reduce((sum, point) => sum + point.value, 0)
  let offset = 0
  return data.map((point) => {
    const length = total > 0 ? (point.value / total) * DONUT_CIRCUMFERENCE : 0
    const segment = { ...point, length, offset }
    offset += length
    return segment
  })
}

function formatShare(value: number, total: number): string {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : '0%'
}

function activationLabel(metric: TokenValueMetric): string {
  return translate('mobile.home.modelMix.showMetric', 'Model mix. Show {{metric}}.', {
    metric:
      metric === 'tokens'
        ? translate('mobile.home.tokens', 'tokens')
        : translate('mobile.home.apiValue', 'API value')
  })
}
