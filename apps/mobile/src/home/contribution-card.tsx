import type { RuntimeStatsSummary } from '@yiru/runtime-protocol/mobile-runtime-types'
import type { ContributionCalendarDay, ContributionPoint } from '@yiru/workbench-model/ui'
import { buildContributionCalendar, getContributionTotals } from '@yiru/workbench-model/ui'
import { useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { MobileContentSection } from '../components/content-section'
import { MobileGlassSegmentedControl } from '../components/glass/segmented-control'
import { translate } from '../i18n/translate'
import { cn } from '../style/class-names'
import {
  type ContributionDisplayMetric,
  formatMetricValue,
  nextTokenValueMetric
} from './chart-data'

const INTENSITY_CLASS: Record<ContributionCalendarDay['intensity'], string> = {
  0: 'border-border bg-muted',
  1: 'border-border bg-muted-foreground/20',
  2: 'border-border bg-muted-foreground/35',
  3: 'border-border bg-muted-foreground/55',
  4: 'border-border bg-foreground/80'
}
const INTENSITY_LEVELS = [0, 1, 2, 3, 4] as const
const CONTRIBUTION_METRIC_OPTIONS = [
  { label: translate('mobile.home.activity', 'Activity'), value: 'activity' },
  { label: translate('mobile.home.tokensTitle', 'Tokens'), value: 'tokens' }
] as const

type MobileContributionCardProps = {
  summary: RuntimeStatsSummary
  metric: ContributionDisplayMetric
  onMetricChange: (metric: ContributionDisplayMetric) => void
}

type ContributionCellProps = {
  day: ContributionCalendarDay
  isSelected: boolean
  onPress: () => void
}

type TokenCoverageProps = MobileContributionCardProps & {
  hasTokens: boolean
}

export function MobileContributionCard({
  summary,
  metric,
  onMetricChange
}: MobileContributionCardProps): React.JSX.Element {
  const [selectedDay, setSelectedDay] = useState<ContributionCalendarDay | null>(null)
  const scrollRef = useRef<ScrollView>(null)

  const activityPoints = useMemo<ContributionPoint[]>(
    () =>
      (summary.dailyActivity ?? []).map((entry) => ({
        day: entry.day,
        value: entry.agentStarts + entry.prsCreated
      })),
    [summary.dailyActivity]
  )
  const tokenPoints = useMemo<ContributionPoint[]>(
    () => (summary.dailyTokens ?? []).map((entry) => ({ day: entry.day, value: entry.tokens })),
    [summary.dailyTokens]
  )
  const valuePoints = useMemo<ContributionPoint[]>(
    () => (summary.dailyValues ?? []).map((entry) => ({ day: entry.day, value: entry.valueUsd })),
    [summary.dailyValues]
  )
  const points =
    metric === 'activity' ? activityPoints : metric === 'tokens' ? tokenPoints : valuePoints
  const calendar = useMemo(() => buildContributionCalendar(points), [points])
  const totals = useMemo(() => getContributionTotals(points), [points])
  const monthLabels = new Map(calendar.monthLabels.map((entry) => [entry.weekIndex, entry.date]))
  const weekdayLabels = calendar.weeks[0]?.days.map((day, weekday) =>
    weekday % 2 === 1 ? day.date.toLocaleDateString(undefined, { weekday: 'narrow' }) : ''
  )

  const chooseMetric = (nextMetric: ContributionDisplayMetric): void => {
    setSelectedDay(null)
    onMetricChange(nextMetric)
  }

  return (
    <MobileContentSection className="mb-4 p-4">
      <View className="mb-4 flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-sm font-semibold">
            {translate('mobile.home.contributions.title', 'Contribution history')}
          </Text>
          <Text className="text-muted-foreground mt-1 text-xs">
            {metric === 'activity'
              ? translate(
                  'mobile.home.contributions.activityDescription',
                  'Agent starts and pull requests completed through Yiru.'
                )
              : metric === 'tokens'
                ? translate(
                    'mobile.home.contributions.tokenDescription',
                    'Provider-reported token usage attributed to Yiru worktrees.'
                  )
                : translate(
                    'mobile.home.contributions.valueDescription',
                    'Standard global API-equivalent value calculated per request.'
                  )}
          </Text>
        </View>
        <View className="w-36">
          <MobileGlassSegmentedControl
            accessibilityLabel={translate('mobile.home.metricSelector', 'Contribution metric')}
            onChange={chooseMetric}
            options={CONTRIBUTION_METRIC_OPTIONS}
            size="small"
            value={metric === 'activity' ? 'activity' : 'tokens'}
          />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        <View className="flex-row pt-4">
          <View className="mr-1 w-3 gap-1">
            {weekdayLabels?.map((label, weekday) => (
              <Text
                key={`${weekday}-${label}`}
                className="text-muted-foreground h-2.5 text-[9px] leading-[10px]"
              >
                {label}
              </Text>
            ))}
          </View>
          <View className="flex-row gap-1">
            {calendar.weeks.map((week, weekIndex) => {
              const monthDate = monthLabels.get(weekIndex)
              return (
                <View key={week.startDay} className="w-2.5 gap-1">
                  {monthDate ? (
                    <Text className="text-muted-foreground absolute -top-4 w-12 text-[10px]">
                      {monthDate.toLocaleDateString(undefined, { month: 'short' })}
                    </Text>
                  ) : null}
                  {week.days.map((day) => (
                    <ContributionCell
                      key={day.day}
                      day={day}
                      isSelected={selectedDay?.day === day.day}
                      onPress={() =>
                        metric === 'activity'
                          ? setSelectedDay(day)
                          : chooseMetric(nextTokenValueMetric(metric))
                      }
                    />
                  ))}
                </View>
              )
            })}
          </View>
        </View>
      </ScrollView>

      <View className="mt-3 flex-row items-center justify-between gap-3">
        <Text className="text-muted-foreground min-w-0 flex-1 text-[11px]">
          {selectedDay ? formatSelectedDay(selectedDay, metric) : formatYearTotal(totals, metric)}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-muted-foreground text-[11px]">
            {translate('mobile.home.less', 'Less')}
          </Text>
          {INTENSITY_LEVELS.map((intensity) => (
            <View
              key={intensity}
              className={cn('size-2 border-hairline', INTENSITY_CLASS[intensity])}
            />
          ))}
          <Text className="text-muted-foreground text-[11px]">
            {translate('mobile.home.more', 'More')}
          </Text>
        </View>
      </View>

      <TokenCoverage
        summary={summary}
        metric={metric}
        onMetricChange={onMetricChange}
        hasTokens={tokenPoints.some((point) => point.value > 0)}
      />
    </MobileContentSection>
  )
}

function ContributionCell({ day, isSelected, onPress }: ContributionCellProps): React.JSX.Element {
  if (day.isFuture) {
    return <View className="border-hairline size-2.5 border-transparent bg-transparent" />
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={translate('mobile.home.contributionCell', '{{day}}: {{value}}', {
        day: day.day,
        value: day.value.toLocaleString()
      })}
      hitSlop={4}
      onPress={onPress}
      className={cn(
        'size-2.5 border-hairline',
        INTENSITY_CLASS[day.intensity],
        isSelected && 'border-ring'
      )}
    />
  )
}

function TokenCoverage({
  summary,
  metric,
  hasTokens
}: TokenCoverageProps): React.JSX.Element | null {
  if (metric === 'activity') {
    return null
  }
  if (!hasTokens) {
    return (
      <Text className="text-muted-foreground mt-3 text-[11px]">
        {translate(
          'mobile.home.tokensUnavailable',
          'No Claude, Codex, or OpenCode token usage attributed to Yiru worktrees is available yet.'
        )}
      </Text>
    )
  }
  if (metric === 'value') {
    return (
      <Text className="text-muted-foreground mt-3 text-[11px]">
        {summary.usageValueAvailable === true
          ? translate(
              'mobile.home.valueCoverage',
              'API-equivalent value uses authoritative per-request model pricing. Unpriced categories are excluded; this is not a bill.'
            )
          : translate(
              'mobile.home.valueUnavailable',
              'No known model pricing is available for this estimate yet.'
            )}
      </Text>
    )
  }
  return (
    <Text className="text-muted-foreground mt-3 text-[11px]">
      {translate(
        'mobile.home.tokenCoverage',
        'Token totals use request-attributed Claude, Codex, and OpenCode records from Yiru worktrees.'
      )}
      {summary.hasUnpricedUsage === true
        ? ` ${translate(
            'mobile.home.unpricedCoverage',
            'Tokens without authoritative pricing are excluded from value totals.'
          )}`
        : ''}
    </Text>
  )
}

function formatSelectedDay(
  day: ContributionCalendarDay,
  metric: ContributionDisplayMetric
): string {
  const date = day.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return translate('mobile.home.selectedDay', '{{date}}: {{value}}', {
    date,
    value: formatValue(day.value, metric)
  })
}

function formatYearTotal(
  totals: ReturnType<typeof getContributionTotals>,
  metric: ContributionDisplayMetric
): string {
  return metric === 'activity'
    ? translate('mobile.home.yearTotal', '{{value}} · {{days}} day streak', {
        value: formatValue(totals.visibleTotal, metric),
        days: totals.currentStreak
      })
    : formatValue(totals.visibleTotal, metric)
}

function formatValue(value: number, metric: ContributionDisplayMetric): string {
  if (metric === 'activity') {
    return translate('mobile.home.activities', '{{value}} activities', {
      value: value.toLocaleString()
    })
  }
  return metric === 'tokens'
    ? translate('mobile.home.tokenValue', '{{value}} tokens', {
        value: formatMetricValue(value, metric)
      })
    : translate('mobile.home.apiValueAmount', '{{value}} API value', {
        value: formatMetricValue(value, metric)
      })
}
