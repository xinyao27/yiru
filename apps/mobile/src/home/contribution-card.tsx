import type { RuntimeStatsSummary } from '@yiru/runtime-protocol/mobile-runtime-types'
import { aiVaultAgentLabel } from '@yiru/workbench-model/agent'
import type {
  ContributionCalendarDay,
  ContributionMetric,
  ContributionPoint
} from '@yiru/workbench-model/ui'
import { buildContributionCalendar, getContributionTotals } from '@yiru/workbench-model/ui'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { cn } from '../style/class-names'
import {
  getContributionMetric,
  loadContributionMetric,
  setContributionMetric,
  subscribeContributionMetric
} from './contribution-metric-preference'

const INTENSITY_CLASS: Record<ContributionCalendarDay['intensity'], string> = {
  0: 'border-border bg-muted',
  1: 'border-border bg-muted-foreground/20',
  2: 'border-border bg-muted-foreground/35',
  3: 'border-border bg-muted-foreground/55',
  4: 'border-border bg-foreground/80'
}
const INTENSITY_LEVELS = [0, 1, 2, 3, 4] as const

type MobileContributionCardProps = {
  summary: RuntimeStatsSummary
}

type MetricButtonProps = {
  label: string
  isActive: boolean
  onPress: () => void
}

type ContributionCellProps = {
  day: ContributionCalendarDay
  isSelected: boolean
  onPress: () => void
}

type TokenCoverageProps = MobileContributionCardProps & {
  metric: ContributionMetric
}

export function MobileContributionCard({
  summary
}: MobileContributionCardProps): React.JSX.Element {
  const metric = useSyncExternalStore(
    subscribeContributionMetric,
    getContributionMetric,
    getContributionMetric
  )
  const [selectedDay, setSelectedDay] = useState<ContributionCalendarDay | null>(null)
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    loadContributionMetric()
  }, [])

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
  const points = metric === 'activity' ? activityPoints : tokenPoints
  const calendar = useMemo(() => buildContributionCalendar(points), [points])
  const totals = useMemo(() => getContributionTotals(points), [points])
  const monthLabels = new Map(calendar.monthLabels.map((entry) => [entry.weekIndex, entry.date]))
  const weekdayLabels = calendar.weeks[0]?.days.map((day, weekday) =>
    weekday % 2 === 1 ? day.date.toLocaleDateString(undefined, { weekday: 'narrow' }) : ''
  )

  const chooseMetric = (nextMetric: ContributionMetric): void => {
    setSelectedDay(null)
    setContributionMetric(nextMetric)
  }

  return (
    <View className="border-hairline border-border bg-card mb-4 p-4">
      <View className="mb-4 flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-sm font-semibold">Contribution history</Text>
          <Text className="text-muted-foreground mt-1 text-xs">
            {metric === 'activity'
              ? 'Agent starts and pull requests across your desktops.'
              : 'Tokens recorded in local agent histories.'}
          </Text>
        </View>
        <View className="border-hairline border-border flex-row">
          <MetricButton
            label="Activity"
            isActive={metric === 'activity'}
            onPress={() => chooseMetric('activity')}
          />
          <MetricButton
            label="Tokens"
            isActive={metric === 'tokens'}
            onPress={() => chooseMetric('tokens')}
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
                      onPress={() => setSelectedDay(day)}
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
          <Text className="text-muted-foreground text-[10px]">Less</Text>
          {INTENSITY_LEVELS.map((intensity) => (
            <View
              key={intensity}
              className={cn('size-2 border-hairline', INTENSITY_CLASS[intensity])}
            />
          ))}
          <Text className="text-muted-foreground text-[10px]">More</Text>
        </View>
      </View>

      <TokenCoverage summary={summary} metric={metric} />
    </View>
  )
}

function MetricButton({ label, isActive, onPress }: MetricButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      className={cn('px-2.5 py-1.5', isActive ? 'bg-accent' : 'bg-transparent')}
    >
      <Text
        className={cn(
          'text-xs font-medium',
          isActive ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function ContributionCell({ day, isSelected, onPress }: ContributionCellProps): React.JSX.Element {
  if (day.isFuture) {
    return <View className="border-hairline size-2.5 border-transparent bg-transparent" />
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${day.day}: ${day.value.toLocaleString()}`}
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

function TokenCoverage({ summary, metric }: TokenCoverageProps): React.JSX.Element | null {
  if (metric !== 'tokens') {
    return null
  }
  if (summary.tokenDataAvailable !== true) {
    return (
      <Text className="text-muted-foreground mt-3 text-[11px]">
        Token history is unavailable for one or more desktops.
      </Text>
    )
  }
  const unavailable = (summary.tokenUnavailableAgents ?? []).map(aiVaultAgentLabel)
  return unavailable.length > 0 ? (
    <Text className="text-muted-foreground mt-3 text-[11px]">
      Excludes {unavailable.join(', ')} because their histories do not report tokens.
    </Text>
  ) : null
}

function formatSelectedDay(day: ContributionCalendarDay, metric: ContributionMetric): string {
  const date = day.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${date}: ${formatValue(day.value, metric)}`
}

function formatYearTotal(
  totals: ReturnType<typeof getContributionTotals>,
  metric: ContributionMetric
): string {
  return `${formatValue(totals.visibleTotal, metric)} · ${totals.currentStreak} day streak`
}

function formatValue(value: number, metric: ContributionMetric): string {
  if (metric === 'activity') {
    return `${value.toLocaleString()} activities`
  }
  return `${Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)} tokens`
}
