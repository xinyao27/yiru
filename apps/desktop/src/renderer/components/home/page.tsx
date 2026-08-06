import type { ContributionPoint } from '@yiru/workbench-model/ui'
import { getContributionTotals } from '@yiru/workbench-model/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContributionHeatmap } from '~renderer/components/contribution-heatmap/heatmap'
import type {
  ContributionDisplayMetric,
  TokenValueMetric
} from '~renderer/components/contribution-heatmap/metric'
import { nextTokenValueMetric } from '~renderer/components/contribution-heatmap/metric'
import {
  loadContributionMetric,
  saveContributionMetric
} from '~renderer/components/contribution-heatmap/preference'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Card, CardContent, CardHeader } from '~renderer/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '~renderer/components/ui/toggle-group'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'

import { loadHomeDataSnapshot, saveHomeDataSnapshot } from './cache'
import { chartActivationLabel } from './chart-activation'
import { ContributionCharts } from './charts'
import { ModelUsageChart } from './model-usage-chart'
import { useUsageValue } from './usage-value'

type MetricDisclosureProps = {
  hasTokens: boolean
  hasUnpricedUsage: boolean
  hasValue: boolean
  isValueScanning: boolean
  metric: ContributionDisplayMetric
  meteredValueUsd?: number | null
}

type SummaryMetricProps = {
  label: string
  value: string
}

export default function HomePage(): React.JSX.Element {
  useTranslation()
  const liveStats = useAppStore((state) => state.statsSummary)
  const fetchStatsSummary = useAppStore((state) => state.fetchStatsSummary)
  const [initialCachedSnapshot] = useState(loadHomeDataSnapshot)
  const cachedSnapshotRef = useRef(initialCachedSnapshot)
  const cachedSnapshot = cachedSnapshotRef.current
  const [metric, setMetric] = useState<ContributionDisplayMetric>(loadContributionMetric)
  const liveUsageValue = useUsageValue()
  const stats = liveStats ?? cachedSnapshot?.stats ?? null
  const usageValue = useMemo(
    () =>
      liveUsageValue.isReady || cachedSnapshot === null
        ? liveUsageValue
        : {
            ...cachedSnapshot.usage,
            isReady: false,
            isScanning: liveUsageValue.isScanning
          },
    [cachedSnapshot, liveUsageValue]
  )

  useEffect(() => {
    void fetchStatsSummary()
  }, [fetchStatsSummary])

  useEffect(() => {
    if (liveStats !== null && liveUsageValue.isReady) {
      cachedSnapshotRef.current = saveHomeDataSnapshot(liveStats, liveUsageValue)
    }
  }, [liveStats, liveUsageValue])

  const activityPoints = useMemo<ContributionPoint[]>(
    () =>
      (stats?.dailyActivity ?? []).map((entry) => ({
        day: entry.day,
        value: entry.agentStarts + entry.prsCreated
      })),
    [stats?.dailyActivity]
  )
  const tokenPoints = usageValue.dailyTokens
  const valuePoints = usageValue.dailyValues
  const points = selectPoints(metric, activityPoints, tokenPoints, valuePoints)
  const streakTotals = useMemo(() => getContributionTotals(activityPoints), [activityPoints])
  const lifetimeTotal = useMemo(() => points.reduce((sum, point) => sum + point.value, 0), [points])
  const hasTokens = tokenPoints.some((point) => point.value > 0)
  const hasValue = usageValue.hasValue

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
            label={metricSummaryLabel(metric)}
            value={
              metric === 'activity'
                ? formatStreak(streakTotals.currentStreak)
                : formatMetricValue(lifetimeTotal, metric, hasValue)
            }
          />
        </div>

        <Card size="compact">
          <CardHeader className="mb-5 flex flex-row flex-wrap items-start justify-between gap-4">
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
          </CardHeader>

          <CardContent>
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
              hasTokens={hasTokens}
              hasUnpricedUsage={usageValue.hasUnpricedUsage}
              hasValue={hasValue}
              isValueScanning={usageValue.isScanning}
              metric={metric}
              meteredValueUsd={usageValue.meteredValueUsd}
            />
          </CardContent>
        </Card>

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
  hasTokens,
  hasUnpricedUsage,
  hasValue,
  isValueScanning,
  metric,
  meteredValueUsd
}: MetricDisclosureProps): React.JSX.Element | null {
  if (metric === 'activity') {
    return null
  }
  if (!hasTokens) {
    return (
      <>
        <p className="text-muted-foreground mt-4 text-xs">
          {isValueScanning
            ? translate('auto.components.home.page.calculatingValue', 'Calculating…')
            : translate(
                'auto.components.home.page.tokensUnavailable',
                'No Claude, Codex, or OpenCode token usage attributed to Yiru worktrees is available yet.'
              )}
        </p>
        <CursorMeteredDisclosure valueUsd={meteredValueUsd} />
      </>
    )
  }
  if (metric === 'value') {
    return (
      <>
        <p className="text-muted-foreground mt-4 text-xs">
          {isValueScanning
            ? translate('auto.components.home.page.calculatingValue', 'Calculating…')
            : hasValue
              ? translate(
                  'auto.components.home.page.valueCoverage',
                  'Standard global API-equivalent value sums authoritative per-request model pricing for usage attributed to Yiru worktrees. Unpriced token categories and session totals without request attribution are excluded; this is not a bill.'
                )
              : translate(
                  'auto.components.home.page.valueUnavailable',
                  'No known model pricing is available for this estimate yet.'
                )}
        </p>
        <CursorMeteredDisclosure valueUsd={meteredValueUsd} />
      </>
    )
  }
  return (
    <>
      <p className="text-muted-foreground mt-4 text-xs">
        {translate(
          'auto.components.home.page.tokenCoverage',
          'Token totals use request-attributed Claude, Codex, and OpenCode records from Yiru worktrees; cached input is not counted twice, and session totals without request attribution are excluded.'
        )}
        {hasUnpricedUsage
          ? ` ${translate(
              'auto.components.home.page.unpricedCoverage',
              'Tokens without authoritative pricing details are excluded from value totals.'
            )}`
          : null}
      </p>
      <CursorMeteredDisclosure valueUsd={meteredValueUsd} />
    </>
  )
}

function CursorMeteredDisclosure({
  valueUsd
}: {
  valueUsd?: number | null
}): React.JSX.Element | null {
  if (valueUsd === undefined || valueUsd === null) {
    return null
  }
  return (
    <p className="text-muted-foreground mt-2 text-xs">
      {translate(
        'auto.components.home.page.cursorMeteredValue',
        'Cursor-metered spend: {{value}} (actual plan deduction; API value above is a list-price estimate).',
        { value: formatUsd(valueUsd) }
      )}
    </p>
  )
}

function formatUsd(value: number): string {
  return Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value)
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
        'Provider-reported token usage attributed to Yiru worktrees.'
      )
    case 'value':
      return translate(
        'auto.components.home.page.valueDescription',
        'Standard global API-equivalent value calculated per request from its model and token categories.'
      )
  }
}

function metricSummaryLabel(metric: ContributionDisplayMetric): string {
  switch (metric) {
    case 'activity':
      return translate('auto.components.home.page.currentStreak', 'Current streak')
    case 'tokens':
      return translate('auto.components.home.page.totalTokens', 'Total tokens')
    case 'value':
      return translate('auto.components.home.page.apiValue', 'API value')
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
