import { aiVaultAgentLabel } from '@yiru/workbench-model/agent'
import type { ContributionPoint } from '@yiru/workbench-model/ui'
import { getContributionTotals } from '@yiru/workbench-model/ui'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ContributionHeatmap } from '@/components/contribution-heatmap/heatmap'
import type {
  ContributionDisplayMetric,
  TokenValueMetric
} from '@/components/contribution-heatmap/metric'
import { nextTokenValueMetric } from '@/components/contribution-heatmap/metric'
import {
  loadContributionMetric,
  saveContributionMetric
} from '@/components/contribution-heatmap/preference'
import { LoadingIndicator } from '@/components/loading-indicator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import type { StatsSummary } from '../../../../shared/types'
import { chartActivationLabel } from './chart-activation'
import { ContributionCharts } from './charts'
import { ModelUsageChart } from './model-usage-chart'
import { useUsageValue } from './usage-value'

type MetricDisclosureProps = {
  hasValue: boolean
  isValueScanning: boolean
  metric: ContributionDisplayMetric
  stats: StatsSummary | null
}

type SummaryMetricProps = {
  label: string
  value: string
}

export default function HomePage(): React.JSX.Element {
  useTranslation()
  const stats = useAppStore((state) => state.statsSummary)
  const fetchStatsSummary = useAppStore((state) => state.fetchStatsSummary)
  const [metric, setMetric] = useState<ContributionDisplayMetric>(loadContributionMetric)
  const usageValue = useUsageValue(stats?.modelTokens)

  useEffect(() => {
    void fetchStatsSummary()
  }, [fetchStatsSummary])

  const activityPoints = useMemo<ContributionPoint[]>(
    () =>
      (stats?.dailyActivity ?? []).map((entry) => ({
        day: entry.day,
        value: entry.agentStarts + entry.prsCreated
      })),
    [stats?.dailyActivity]
  )
  const tokenPoints = useMemo<ContributionPoint[]>(
    () => (stats?.dailyTokens ?? []).map((entry) => ({ day: entry.day, value: entry.tokens })),
    [stats?.dailyTokens]
  )
  const usdPerToken = usageValue.usdPerToken
  const valuePoints = useMemo<ContributionPoint[]>(
    () =>
      usdPerToken === null
        ? []
        : tokenPoints.map((point) => ({
            day: point.day,
            value: point.value * usdPerToken
          })),
    [tokenPoints, usdPerToken]
  )
  const points = selectPoints(metric, activityPoints, tokenPoints, valuePoints)
  const streakTotals = useMemo(
    () => getContributionTotals(metric === 'value' ? tokenPoints : points),
    [metric, points, tokenPoints]
  )
  const lifetimeTotal = useMemo(() => points.reduce((sum, point) => sum + point.value, 0), [points])
  const peakDay = useMemo(
    () => points.reduce((peak, point) => Math.max(peak, point.value), 0),
    [points]
  )
  const hasValue = usdPerToken !== null

  const selectMetric = (nextMetric: ContributionDisplayMetric): void => {
    setMetric(nextMetric)
    saveContributionMetric(nextMetric)
  }
  const selectTokenValueMetric = (nextMetric: TokenValueMetric): void => {
    selectMetric(nextMetric)
  }
  const switchChartMetric = (): void => {
    selectMetric(nextTokenValueMetric(metric))
  }

  return (
    <div className="scrollbar-sleek bg-background h-full overflow-y-auto">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-8 pb-10">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-foreground text-sm font-semibold">
              {translate('auto.components.home.page.title', 'Home')}
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              {translate(
                'auto.components.home.page.description',
                'A year of agent work, with today in context.'
              )}
            </p>
          </div>
          {stats === null ? <LoadingIndicator className="mt-1 size-4" /> : null}
        </header>

        <div className="border-border bg-border grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
          {metric === 'activity' ? (
            <>
              <SummaryMetric
                label={translate(
                  'auto.components.home.activitySummary.agentsSpawned',
                  'Agents spawned'
                )}
                value={stats?.totalAgentsSpawned.toLocaleString() ?? '—'}
              />
              <SummaryMetric
                label={translate(
                  'auto.components.home.activitySummary.agentTime',
                  'Time agents worked'
                )}
                value={stats === null ? '—' : formatDuration(stats.totalAgentTimeMs)}
              />
              <SummaryMetric
                label={translate('auto.components.home.activitySummary.prsCreated', 'PRs created')}
                value={stats?.totalPRsCreated.toLocaleString() ?? '—'}
              />
              <SummaryMetric
                label={translate('auto.components.home.page.currentStreak', 'Current streak')}
                value={formatStreak(streakTotals.currentStreak)}
              />
            </>
          ) : (
            <>
              <SummaryMetric
                label={translate('auto.components.home.page.lifetime', 'Lifetime')}
                value={formatMetricValue(lifetimeTotal, metric, hasValue)}
              />
              <SummaryMetric
                label={translate('auto.components.home.page.peakDay', 'Peak day')}
                value={formatMetricValue(peakDay, metric, hasValue)}
              />
              <SummaryMetric
                label={translate('auto.components.home.page.currentStreak', 'Current streak')}
                value={formatStreak(streakTotals.currentStreak)}
              />
              <SummaryMetric
                label={translate('auto.components.home.page.longestStreakLabel', 'Longest streak')}
                value={formatStreak(streakTotals.longestStreak)}
              />
            </>
          )}
        </div>

        <section className="border-border bg-card border p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-foreground text-sm font-semibold">
                {translate('auto.components.home.page.contributions', 'Contribution history')}
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">{metricDescription(metric)}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[metric === 'activity' ? 'activity' : 'tokens']}
                onValueChange={(values) => {
                  const nextMetric = values[0]
                  if (nextMetric === 'activity' || nextMetric === 'tokens') {
                    selectMetric(nextMetric)
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
            </div>
          </div>

          <div className="scrollbar-sleek scrollbar-sleek-lg overflow-x-auto pb-1">
            <ContributionHeatmap
              activationLabel={chartActivationLabel(
                translate('auto.components.home.page.contributions', 'Contribution history'),
                metric
              )}
              points={points}
              metric={metric}
              onActivate={switchChartMetric}
            />
          </div>

          <MetricDisclosure
            hasValue={hasValue}
            isValueScanning={usageValue.isScanning}
            metric={metric}
            stats={stats}
          />
        </section>

        <ContributionCharts
          points={points}
          metric={metric}
          onMetricChange={selectTokenValueMetric}
        />

        {metric === 'activity' ? null : (
          <ModelUsageChart
            metric={metric}
            models={usageValue.models}
            onMetricChange={selectTokenValueMetric}
          />
        )}
      </main>
    </div>
  )
}

function MetricDisclosure({
  hasValue,
  isValueScanning,
  metric,
  stats
}: MetricDisclosureProps): React.JSX.Element | null {
  if (metric === 'activity') {
    return null
  }
  if (stats?.tokenDataAvailable !== true) {
    return (
      <p className="text-muted-foreground mt-4 text-xs">
        {translate(
          'auto.components.home.page.tokensUnavailable',
          'Token history is unavailable right now.'
        )}
      </p>
    )
  }
  if (metric === 'value') {
    return (
      <p className="text-muted-foreground mt-4 text-xs">
        {isValueScanning
          ? translate('auto.components.home.page.calculatingValue', 'Calculating…')
          : hasValue
            ? translate(
                'auto.components.home.page.valueCoverage',
                'API value is an estimate based on enabled providers with known model pricing, not an actual bill.'
              )
            : translate(
                'auto.components.home.page.valueUnavailable',
                'No known model pricing is available for this estimate yet.'
              )}
      </p>
    )
  }
  const unavailableAgents = (stats.tokenUnavailableAgents ?? []).map(aiVaultAgentLabel)
  if (unavailableAgents.length === 0) {
    return null
  }
  return (
    <p className="text-muted-foreground mt-4 text-xs">
      {translate(
        'auto.components.home.page.tokenCoverage',
        'Token totals exclude {{value0}} because their session histories do not report usage.',
        { value0: unavailableAgents.join(', ') }
      )}
    </p>
  )
}

function SummaryMetric({ label, value }: SummaryMetricProps): React.JSX.Element {
  return (
    <section className="bg-card px-4 py-3 text-center">
      <p className="text-foreground text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{label}</p>
    </section>
  )
}

function formatStreak(days: number): string {
  return translate('auto.components.home.page.streakDays', '{{value0}} days', {
    value0: days.toLocaleString()
  })
}

function formatDuration(durationMs: number): string {
  if (durationMs <= 0) {
    return translate('auto.components.home.activitySummary.durationMinutes', '{{value0}}m', {
      value0: 0
    })
  }
  const totalMinutes = Math.floor(durationMs / 60_000)
  const totalHours = Math.floor(totalMinutes / 60)
  const totalDays = Math.floor(totalHours / 24)
  const remainingHours = totalHours % 24
  const remainingMinutes = totalMinutes % 60
  if (totalDays > 0) {
    return translate(
      'auto.components.home.activitySummary.durationDaysHours',
      '{{value0}}d {{value1}}h',
      { value0: totalDays, value1: remainingHours }
    )
  }
  if (totalHours > 0) {
    return translate(
      'auto.components.home.activitySummary.durationHoursMinutes',
      '{{value0}}h {{value1}}m',
      { value0: totalHours, value1: remainingMinutes }
    )
  }
  return translate('auto.components.home.activitySummary.durationMinutes', '{{value0}}m', {
    value0: totalMinutes
  })
}

function selectPoints(
  metric: ContributionDisplayMetric,
  activityPoints: ContributionPoint[],
  tokenPoints: ContributionPoint[],
  valuePoints: ContributionPoint[]
): ContributionPoint[] {
  switch (metric) {
    case 'activity':
      return activityPoints
    case 'tokens':
      return tokenPoints
    case 'value':
      return valuePoints
  }
}

function metricDescription(metric: ContributionDisplayMetric): string {
  switch (metric) {
    case 'activity':
      return translate(
        'auto.components.home.page.activityDescription',
        'Agent starts and pull requests completed through Yiru.'
      )
    case 'tokens':
      return translate(
        'auto.components.home.page.tokenDescription',
        'Tokens recorded in local agent session histories.'
      )
    case 'value':
      return translate(
        'auto.components.home.page.valueDescription',
        'Estimated API-equivalent value using your known-model blended rate.'
      )
  }
}

function formatMetricValue(
  value: number,
  metric: ContributionDisplayMetric,
  hasValue: boolean
): string {
  if (metric === 'activity') {
    return value.toLocaleString()
  }
  if (metric === 'value') {
    return hasValue
      ? Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          maximumFractionDigits: 1
        }).format(value)
      : translate('auto.components.home.page.valueNotAvailable', 'Not available')
  }
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  )
}
