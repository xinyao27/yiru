import type { RuntimeStatsSummary } from '@yiru/runtime-protocol/mobile-runtime-types'
import type { StatsUsageBoundedRange } from '@yiru/runtime-protocol/stats-usage-range'
import type { ContributionPoint } from '@yiru/workbench-model/ui'
import { getContributionTotals } from '@yiru/workbench-model/ui'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { Text, View } from 'react-native'

import { MobileContentSection } from '../components/content-section'
import { MobileSegmentedControl } from '../components/segmented-control'
import { translate } from '../i18n/translate'
import type { ContributionDisplayMetric } from './chart-data'
import { formatMetricValue } from './chart-data'
import { ContributionCharts } from './charts'
import { MobileContributionCard } from './contribution-card'
import {
  getContributionMetric,
  loadContributionMetric,
  setContributionMetric,
  subscribeContributionMetric
} from './contribution-metric-preference'
import { ModelUsageChart } from './model-usage-chart'
import { ProjectUsageList } from './usage/project-list'
import { ProviderUsageChart } from './usage/provider-chart'
import { HOME_USAGE_RANGE_OPTIONS } from './usage/range'
import {
  ensureUsageRange,
  getUsageRange,
  setUsageRange,
  subscribeUsageRange
} from './usage/range-preference'

type MobileActivityInsightsDashboardProps = {
  summary: RuntimeStatsSummary | null
  isUsageRangePending: boolean
}

type SummaryMetricProps = {
  label: string
  value: string
}

export function MobileActivityInsightsDashboard({
  summary,
  isUsageRangePending
}: MobileActivityInsightsDashboardProps): React.JSX.Element {
  const stats = summary ?? EMPTY_SUMMARY
  const metric = useSyncExternalStore(
    subscribeContributionMetric,
    getContributionMetric,
    getContributionMetric
  )
  const usageRange = useSyncExternalStore(subscribeUsageRange, getUsageRange, getUsageRange)

  useEffect(() => {
    loadContributionMetric()
    void ensureUsageRange()
  }, [])

  const activityPoints = useMemo<ContributionPoint[]>(
    () =>
      (stats.dailyActivity ?? []).map((entry) => ({
        day: entry.day,
        value: entry.agentStarts + entry.prsCreated
      })),
    [stats.dailyActivity]
  )
  const tokenPoints = useMemo<ContributionPoint[]>(
    () => (stats.dailyTokens ?? []).map((entry) => ({ day: entry.day, value: entry.tokens })),
    [stats.dailyTokens]
  )
  const valuePoints = useMemo<ContributionPoint[]>(
    () => (stats.dailyValues ?? []).map((entry) => ({ day: entry.day, value: entry.valueUsd })),
    [stats.dailyValues]
  )
  const points = selectPoints(metric, activityPoints, tokenPoints, valuePoints)
  const streak = useMemo(() => getContributionTotals(activityPoints), [activityPoints])
  const metricTotal = points.reduce((sum, point) => sum + point.value, 0)
  const hasValue = stats.usageValueAvailable === true
  const selectMetric = (nextMetric: ContributionDisplayMetric): void => {
    setContributionMetric(nextMetric)
  }

  return (
    <View>
      <Text className="text-muted-foreground mb-4 text-sm">
        {translate('mobile.home.description', 'A year of agent work, with today in context.')}
      </Text>

      <MobileContentSection className="bg-border mb-4 gap-px">
        <View className="flex-row gap-px">
          <SummaryMetric
            label={translate('mobile.home.agentsSpawned', 'Agents spawned')}
            value={summary ? stats.totalAgentsSpawned.toLocaleString() : '—'}
          />
          <SummaryMetric
            label={translate('mobile.home.agentTime', 'Time agents worked')}
            value={summary ? formatDuration(stats.totalAgentTimeMs) : '—'}
          />
        </View>
        <View className="flex-row gap-px">
          <SummaryMetric
            label={translate('mobile.home.prsCreated', 'PRs created')}
            value={summary ? stats.totalPRsCreated.toLocaleString() : '—'}
          />
          <SummaryMetric
            label={metricSummaryLabel(metric)}
            value={
              !summary
                ? '—'
                : metric === 'activity'
                  ? translate('mobile.home.streakDays', '{{days}} days', {
                      days: streak.currentStreak.toLocaleString()
                    })
                  : metric === 'value' && !hasValue
                    ? translate('mobile.home.notAvailable', 'Not available')
                    : formatMetricValue(metricTotal, metric)
            }
          />
        </View>
      </MobileContentSection>

      {metric === 'activity' ? null : (
        <View className="mb-4 gap-2">
          <MobileSegmentedControl
            accessibilityLabel={translate('mobile.home.usageRange.label', 'Usage range')}
            onChange={setUsageRange}
            options={HOME_USAGE_RANGE_OPTIONS}
            value={usageRange}
          />
          <UsageRangeNotice isPending={isUsageRangePending} range={usageRange} summary={summary} />
        </View>
      )}

      <MobileContributionCard summary={stats} metric={metric} onMetricChange={selectMetric} />
      <ContributionCharts points={points} metric={metric} onMetricChange={selectMetric} />
      {metric === 'activity' ? null : (
        <>
          <ProviderUsageChart
            daily={stats.dailyProviderUsage ?? []}
            metric={metric}
            range={usageRange}
            onMetricChange={selectMetric}
          />
          <ModelUsageChart
            metric={metric}
            models={stats.modelUsage ?? []}
            onMetricChange={selectMetric}
          />
          <ProjectUsageList metric={metric} projects={stats.projectUsage ?? []} />
        </>
      )}
    </View>
  )
}

function UsageRangeNotice({
  isPending,
  range,
  summary
}: {
  isPending: boolean
  range: StatsUsageBoundedRange
  summary: RuntimeStatsSummary | null
}): React.JSX.Element | null {
  if (isPending) {
    return (
      <Text className="text-muted-foreground text-xs">
        {translate('mobile.home.usageRange.updating', 'Updating usage for the selected range…')}
      </Text>
    )
  }
  if (summary === null || summary.usageRange === range) {
    return null
  }
  return (
    <Text className="text-muted-foreground text-xs">
      {translate(
        'mobile.home.usageRange.unsupported',
        'A connected host reported all-time usage instead of this range.'
      )}
    </Text>
  )
}

const EMPTY_SUMMARY: RuntimeStatsSummary = {
  totalAgentsSpawned: 0,
  totalPRsCreated: 0,
  totalAgentTimeMs: 0,
  firstEventAt: null,
  dailyActivity: [],
  dailyTokens: [],
  dailyValues: [],
  modelUsage: []
}

function SummaryMetric({ label, value }: SummaryMetricProps): React.JSX.Element {
  return (
    <View className="bg-card min-w-0 flex-1 items-center px-3 py-3">
      <Text className="text-foreground text-sm font-semibold tabular-nums">{value}</Text>
      <Text className="text-muted-foreground mt-1 text-center text-xs">{label}</Text>
    </View>
  )
}

function selectPoints(
  metric: ContributionDisplayMetric,
  activity: ContributionPoint[],
  tokens: ContributionPoint[],
  value: ContributionPoint[]
): ContributionPoint[] {
  switch (metric) {
    case 'activity':
      return activity
    case 'tokens':
      return tokens
    case 'value':
      return value
  }
}

function metricSummaryLabel(metric: ContributionDisplayMetric): string {
  switch (metric) {
    case 'activity':
      return translate('mobile.home.currentStreak', 'Current streak')
    case 'tokens':
      return translate('mobile.home.totalTokens', 'Total tokens')
    case 'value':
      return translate('mobile.home.apiValue', 'API value')
  }
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const totalHours = Math.floor(totalMinutes / 60)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0) {
    return translate('mobile.home.durationDaysHours', '{{days}}d {{hours}}h', { days, hours })
  }
  const minutes = totalMinutes % 60
  return totalHours > 0
    ? translate('mobile.home.durationHoursMinutes', '{{hours}}h {{minutes}}m', {
        hours: totalHours,
        minutes
      })
    : translate('mobile.home.durationMinutes', '{{minutes}}m', { minutes: totalMinutes })
}
