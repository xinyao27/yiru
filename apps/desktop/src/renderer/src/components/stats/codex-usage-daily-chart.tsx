import { translate } from '@/i18n/i18n'

import type { CodexUsageDailyPoint } from '../../../../shared/codex-usage-types'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`
  }
  return value.toLocaleString()
}

function getMaxDailyTotal(daily: CodexUsageDailyPoint[]): number {
  let max = 1
  // Why: all-time usage histories can exceed V8's argument limit if spread
  // into Math.max, even though the chart only renders the last 10 days.
  for (const entry of daily) {
    max = Math.max(max, entry.totalTokens)
  }
  return max
}

type CodexUsageDailyChartProps = {
  daily: CodexUsageDailyPoint[]
}

export function CodexUsageDailyChart({ daily }: CodexUsageDailyChartProps): React.JSX.Element {
  const maxDailyTotal = getMaxDailyTotal(daily)

  return (
    <section className="border-border/60 bg-card/40 border p-4">
      <div className="mb-3">
        <h4 className="text-foreground text-sm font-semibold">
          {translate('auto.components.stats.CodexUsageDailyChart.609aa96e8b', 'Daily usage')}
        </h4>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.stats.CodexUsageDailyChart.c756cda6a8',
            'Input, cached input, output, and reasoning totals by day.'
          )}
        </p>
      </div>
      <div className="grid h-56 grid-cols-10 items-end gap-3">
        {daily.slice(-10).map((entry) => {
          const segments = [
            {
              key: 'input',
              label: translate('auto.components.stats.CodexUsageDailyChart.99a91d3143', 'Input'),
              value: entry.inputTokens,
              className: 'bg-sky-500/80'
            },
            {
              key: 'output',
              label: translate('auto.components.stats.CodexUsageDailyChart.7b596a88b2', 'Output'),
              value: entry.outputTokens,
              className: 'bg-emerald-500/80'
            },
            {
              key: 'cached-input',
              label: translate(
                'auto.components.stats.CodexUsageDailyChart.c646e1783c',
                'Cached input'
              ),
              value: entry.cachedInputTokens,
              className: 'bg-amber-500/70'
            },
            {
              key: 'reasoning',
              label: translate(
                'auto.components.stats.CodexUsageDailyChart.1e6f62d7e3',
                'Reasoning'
              ),
              value: entry.reasoningOutputTokens,
              className: 'bg-fuchsia-500/70'
            }
          ]
          return (
            <div key={entry.day} className="flex h-full min-w-0 flex-col justify-end gap-2">
              <span className="text-muted-foreground text-center text-[11px]">
                {formatTokens(entry.totalTokens)}
              </span>
              <div className="flex min-h-0 flex-1 items-end justify-center">
                <div className="bg-muted/60 flex h-full w-full max-w-12 overflow-hidden">
                  <div className="flex h-full w-full flex-col justify-end">
                    {segments.map((segment) =>
                      segment.value > 0 ? (
                        <TooltipProvider key={segment.key} delay={120}>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <div
                                  className={segment.className}
                                  style={{ height: `${(segment.value / maxDailyTotal) * 100}%` }}
                                />
                              }
                            />
                            <TooltipContent side="top" sideOffset={8}>
                              <div className="text-xs">
                                <div>{entry.day}</div>
                                <div>
                                  {segment.label}: {segment.value.toLocaleString()}{' '}
                                  {translate(
                                    'auto.components.stats.CodexUsageDailyChart.e4bdcf0071',
                                    'tokens'
                                  )}
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null
                    )}
                  </div>
                </div>
              </div>
              <span className="text-muted-foreground text-center text-[11px]">
                {entry.day.slice(5)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="text-muted-foreground mt-3 flex flex-wrap gap-4 text-xs">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 bg-sky-500/80" />
          {translate('auto.components.stats.CodexUsageDailyChart.99a91d3143', 'Input')}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 bg-emerald-500/80" />
          {translate('auto.components.stats.CodexUsageDailyChart.7b596a88b2', 'Output')}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 bg-amber-500/70" />
          {translate('auto.components.stats.CodexUsageDailyChart.c646e1783c', 'Cached input')}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 bg-fuchsia-500/70" />
          {translate('auto.components.stats.CodexUsageDailyChart.1e6f62d7e3', 'Reasoning')}
        </span>
      </div>
    </section>
  )
}
