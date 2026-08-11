import type {
  RuntimeStatsProjectUsage,
  RuntimeStatsProviderUsage
} from '@yiru/runtime-protocol/mobile-runtime-types'
import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { MobileContentSection } from '~/components/content-section'
import { MobileSearchField } from '~/components/search-field'
import { translate } from '~/i18n/translate'
import { resolveCssString } from '~/style/resolve-css-variable'

import { formatMetricValue, type TokenValueMetric } from '../chart-data'
import { providerLabel, providerOpacity } from './provider-presentation'

const COLLAPSED_PROJECT_COUNT = 6
const FILTERABLE_PROJECT_COUNT = 6

type ProjectUsageListProps = {
  metric: TokenValueMetric
  projects: readonly RuntimeStatsProjectUsage[]
}

export function ProjectUsageList({ metric, projects }: ProjectUsageListProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchingProjects = useMemo(
    () =>
      [...projects]
        .filter((project) => project.label.toLocaleLowerCase().includes(normalizedQuery))
        .sort((left, right) => {
          const difference = projectMetric(right, metric) - projectMetric(left, metric)
          return difference === 0 ? right.tokens - left.tokens : difference
        }),
    [metric, normalizedQuery, projects]
  )
  const visibleProjects =
    isExpanded || normalizedQuery.length > 0
      ? matchingProjects
      : matchingProjects.slice(0, COLLAPSED_PROJECT_COUNT)
  const hiddenCount = matchingProjects.length - visibleProjects.length

  return (
    <MobileContentSection className="mb-4 p-4">
      <Text className="text-foreground text-sm font-semibold">
        {translate('mobile.home.projectUsage.title', 'By project')}
      </Text>
      <Text className="text-muted-foreground mt-1 text-xs">{summaryLine(projects, metric)}</Text>

      {projects.length > FILTERABLE_PROJECT_COUNT ? (
        <View className="mt-3">
          <MobileSearchField
            onChangeText={setQuery}
            placeholder={translate('mobile.home.projectUsage.filter', 'Filter projects')}
            value={query}
          />
        </View>
      ) : null}

      {visibleProjects.length > 0 ? (
        <View className="mt-1">
          {visibleProjects.map((project, index) => (
            <View key={project.key}>
              {index > 0 ? <View className="bg-border h-hairline" /> : null}
              <ProjectRow metric={metric} project={project} />
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-muted-foreground mt-4 text-center text-xs">
          {projects.length === 0
            ? translate(
                'mobile.home.projectUsage.empty',
                'No project-attributed usage is available yet.'
              )
            : translate('mobile.home.projectUsage.noResults', 'No projects match this filter.')}
        </Text>
      )}

      {hiddenCount > 0 || (isExpanded && normalizedQuery.length === 0) ? (
        <Pressable
          accessibilityRole="button"
          className="active:bg-accent mt-2 min-h-11 justify-center rounded-2xl px-2"
          onPress={() => setIsExpanded(!isExpanded)}
        >
          <Text className="text-foreground text-sm">
            {hiddenCount > 0
              ? translate('mobile.home.projectUsage.showAll', 'Show all {{count}} projects', {
                  count: matchingProjects.length
                })
              : translate('mobile.home.projectUsage.showLess', 'Show less')}
          </Text>
        </Pressable>
      ) : null}

      {metric === 'value' && projects.some((project) => project.valueUsd === null) ? (
        <Text className="text-muted-foreground mt-3 text-[11px]">
          {translate(
            'mobile.home.projectUsage.unpriced',
            'Projects containing usage without authoritative pricing show no combined API value.'
          )}
        </Text>
      ) : null}
    </MobileContentSection>
  )
}

function ProjectRow({
  metric,
  project
}: {
  metric: TokenValueMetric
  project: RuntimeStatsProjectUsage
}): React.JSX.Element {
  const chartColor = resolveCssString(useCSSVariable('--color-muted-foreground'))
  const value = metric === 'tokens' ? project.tokens : project.valueUsd
  const providerTotal = project.providers.reduce(
    (sum, usage) => sum + providerMetric(usage, metric),
    0
  )

  return (
    <View className="py-3">
      <View className="flex-row items-baseline gap-3">
        <Text className="text-foreground min-w-0 flex-1 text-sm font-medium" numberOfLines={1}>
          {project.label}
        </Text>
        <Text className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
          {value === null ? '—' : formatMetricValue(value, metric)}
        </Text>
      </View>
      <Text className="text-muted-foreground mt-1 text-xs">
        {translate('mobile.home.projectUsage.projectDetail', '{{tokens}} · {{sessions}} sessions', {
          tokens: formatMetricValue(project.tokens, 'tokens'),
          sessions: project.sessions.toLocaleString()
        })}
      </Text>

      {providerTotal > 0 ? (
        <View className="bg-muted mt-2 h-1 flex-row overflow-hidden">
          {project.providers.map((usage) => (
            <View
              key={usage.provider}
              style={{
                backgroundColor: chartColor,
                opacity: providerOpacity(usage.provider),
                width: `${(providerMetric(usage, metric) / providerTotal) * 100}%`
              }}
            />
          ))}
        </View>
      ) : null}

      <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
        {project.providers.map((usage) => (
          <View key={usage.provider} className="flex-row items-center gap-1.5">
            <View
              className="size-2"
              style={{ backgroundColor: chartColor, opacity: providerOpacity(usage.provider) }}
            />
            <Text className="text-muted-foreground text-[11px]">
              {providerLabel(usage.provider)}
            </Text>
            <Text className="text-foreground text-[11px] tabular-nums">
              {providerValueLabel(usage, metric)}
            </Text>
            {providerTotal > 0 && providerMetric(usage, metric) > 0 ? (
              <Text className="text-muted-foreground text-[11px] tabular-nums">
                {formatPercent(providerMetric(usage, metric) / providerTotal)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  )
}

function summaryLine(
  projects: readonly RuntimeStatsProjectUsage[],
  metric: TokenValueMetric
): string {
  const totalTokens = projects.reduce((sum, project) => sum + project.tokens, 0)
  const totalSessions = projects.reduce((sum, project) => sum + project.sessions, 0)
  if (metric === 'tokens') {
    return translate(
      'mobile.home.projectUsage.tokenSummary',
      '{{tokens}} · {{projects}} projects · {{sessions}} sessions',
      {
        tokens: formatMetricValue(totalTokens, 'tokens'),
        projects: projects.length.toLocaleString(),
        sessions: totalSessions.toLocaleString()
      }
    )
  }
  const knownValueUsd = projects.reduce((sum, project) => sum + (project.valueUsd ?? 0), 0)
  return translate(
    'mobile.home.projectUsage.valueSummary',
    '{{value}} known API value · {{projects}} projects · {{tokens}}',
    {
      value: projects.some((project) => project.valueUsd !== null)
        ? formatMetricValue(knownValueUsd, 'value')
        : '—',
      projects: projects.length.toLocaleString(),
      tokens: formatMetricValue(totalTokens, 'tokens')
    }
  )
}

function providerValueLabel(usage: RuntimeStatsProviderUsage, metric: TokenValueMetric): string {
  const value = metric === 'tokens' ? usage.tokens : usage.valueUsd
  return value === null ? '—' : formatMetricValue(value, metric)
}

function projectMetric(project: RuntimeStatsProjectUsage, metric: TokenValueMetric): number {
  return metric === 'tokens' ? project.tokens : (project.valueUsd ?? 0)
}

function providerMetric(usage: RuntimeStatsProviderUsage, metric: TokenValueMetric): number {
  return metric === 'tokens' ? usage.tokens : (usage.valueUsd ?? 0)
}

function formatPercent(value: number): string {
  return Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(value)
}
