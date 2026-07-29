import { aiVaultAgentLabel } from '@yiru/workbench-model/agent'
import type { ContributionMetric, ContributionPoint } from '@yiru/workbench-model/ui'
import { getContributionTotals } from '@yiru/workbench-model/ui'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ContributionHeatmap } from '@/components/contribution-heatmap/heatmap'
import {
  loadContributionMetric,
  saveContributionMetric
} from '@/components/contribution-heatmap/preference'
import { LoadingIndicator } from '@/components/loading-indicator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import type { StatsSummary } from '../../../../shared/types'
import { ContributionCharts } from './charts'

type MetricDisclosureProps = {
  metric: ContributionMetric
  stats: StatsSummary | null
}

type SummaryCardProps = {
  label: string
  value: string
  detail: string
}

export default function HomePage(): React.JSX.Element {
  useTranslation()
  const stats = useAppStore((state) => state.statsSummary)
  const fetchStatsSummary = useAppStore((state) => state.fetchStatsSummary)
  const [metric, setMetric] = useState<ContributionMetric>(loadContributionMetric)

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
  const points = metric === 'activity' ? activityPoints : tokenPoints
  const totals = useMemo(() => getContributionTotals(points), [points])

  const selectMetric = (nextMetric: ContributionMetric): void => {
    setMetric(nextMetric)
    saveContributionMetric(nextMetric)
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

        <section className="border-border bg-card border p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-foreground text-sm font-semibold">
                {translate('auto.components.home.page.contributions', 'Contribution history')}
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                {metric === 'activity'
                  ? translate(
                      'auto.components.home.page.activityDescription',
                      'Agent starts and pull requests completed through Yiru.'
                    )
                  : translate(
                      'auto.components.home.page.tokenDescription',
                      'Tokens recorded in local agent session histories.'
                    )}
              </p>
            </div>
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[metric]}
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

          <div className="scrollbar-sleek scrollbar-sleek-lg overflow-x-auto pb-1">
            <ContributionHeatmap points={points} metric={metric} />
          </div>

          <MetricDisclosure metric={metric} stats={stats} />
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label={translate('auto.components.home.page.today', 'Today')}
            value={formatMetricValue(totals.today, metric)}
            detail={
              metric === 'activity'
                ? translate('auto.components.home.page.todayActivity', 'recorded activity')
                : translate('auto.components.home.page.todayTokens', 'recorded tokens')
            }
          />
          <SummaryCard
            label={translate('auto.components.home.page.currentStreak', 'Current streak')}
            value={translate('auto.components.home.page.streakDays', '{{value0}} days', {
              value0: totals.currentStreak.toLocaleString()
            })}
            detail={translate(
              'auto.components.home.page.longestStreak',
              'Longest this year: {{value0}} days',
              { value0: totals.longestStreak.toLocaleString() }
            )}
          />
          <SummaryCard
            label={translate('auto.components.home.page.pastYear', 'Past year')}
            value={formatMetricValue(totals.visibleTotal, metric)}
            detail={
              metric === 'activity'
                ? translate('auto.components.home.page.totalActivity', 'total recorded activity')
                : translate('auto.components.home.page.totalTokens', 'total recorded tokens')
            }
          />
        </div>

        <ContributionCharts points={points} metric={metric} />
      </main>
    </div>
  )
}

function MetricDisclosure({ metric, stats }: MetricDisclosureProps): React.JSX.Element | null {
  if (metric !== 'tokens') {
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

function SummaryCard({ label, value, detail }: SummaryCardProps): React.JSX.Element {
  return (
    <section className="border-border bg-card border p-4">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.05em] uppercase">
        {label}
      </p>
      <p className="text-foreground mt-2 text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </section>
  )
}

function formatMetricValue(value: number, metric: ContributionMetric): string {
  if (metric === 'activity') {
    return value.toLocaleString()
  }
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  )
}
