import type {
  ContributionCalendarDay,
  ContributionMetric,
  ContributionPoint
} from '@yiru/workbench-model/ui'
import { buildContributionCalendar } from '@yiru/workbench-model/ui'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

const INTENSITY_CLASS: Record<ContributionCalendarDay['intensity'], string> = {
  0: 'border-border/60 bg-muted/40',
  1: 'border-border/70 bg-muted-foreground/20',
  2: 'border-border/80 bg-muted-foreground/35',
  3: 'border-border bg-muted-foreground/55',
  4: 'border-border bg-foreground/80'
}
const INTENSITY_LEVELS = [0, 1, 2, 3, 4] as const

type ContributionHeatmapProps = {
  points: readonly ContributionPoint[]
  metric: ContributionMetric
  anchorDate?: Date
}

type ContributionCellProps = {
  day: ContributionCalendarDay
  metric: ContributionMetric
}

export function ContributionHeatmap({
  points,
  metric,
  anchorDate
}: ContributionHeatmapProps): React.JSX.Element {
  useTranslation()
  const calendar = useMemo(
    () => buildContributionCalendar(points, anchorDate),
    [anchorDate, points]
  )
  const days = calendar.weeks.flatMap((week) => week.days)
  const weekdayLabels = [
    { day: 'sunday', label: '' },
    {
      day: 'monday',
      label: translate('auto.components.contribution.heatmap.monday', 'Mon')
    },
    { day: 'tuesday', label: '' },
    {
      day: 'wednesday',
      label: translate('auto.components.contribution.heatmap.wednesday', 'Wed')
    },
    { day: 'thursday', label: '' },
    {
      day: 'friday',
      label: translate('auto.components.contribution.heatmap.friday', 'Fri')
    },
    { day: 'saturday', label: '' }
  ]

  return (
    <div className="mx-auto w-max min-w-[610px]">
      <div className="text-muted-foreground mb-1 grid grid-cols-[24px_repeat(53,10px)] gap-x-1 text-[11px]">
        <span />
        {calendar.monthLabels.map((label) => (
          <span
            key={`${label.date.getFullYear()}-${label.date.getMonth()}`}
            className="whitespace-nowrap"
            style={{ gridColumnStart: label.weekIndex + 2 }}
          >
            {label.date.toLocaleDateString(undefined, { month: 'short' })}
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="text-muted-foreground grid grid-rows-[repeat(7,10px)] gap-1 text-[10px] leading-[10px]">
          {weekdayLabels.map((entry) => (
            <span key={entry.day}>{entry.label}</span>
          ))}
        </div>
        <div
          className="grid auto-cols-[10px] grid-flow-col grid-rows-[repeat(7,10px)] gap-1"
          role="grid"
          aria-label={
            metric === 'activity'
              ? translate(
                  'auto.components.contribution.heatmap.activityLabel',
                  'Daily agent activity over the past year'
                )
              : translate(
                  'auto.components.contribution.heatmap.tokensLabel',
                  'Daily token usage over the past year'
                )
          }
        >
          {days.map((day) => (
            <ContributionCell key={day.day} day={day} metric={metric} />
          ))}
        </div>
      </div>

      <div className="text-muted-foreground mt-3 flex items-center justify-center gap-2 text-[11px]">
        <span>{translate('auto.components.contribution.heatmap.less', 'Less')}</span>
        <div className="flex items-center gap-1" aria-hidden>
          {INTENSITY_LEVELS.map((intensity) => (
            <span key={intensity} className={cn('size-2.5 border', INTENSITY_CLASS[intensity])} />
          ))}
        </div>
        <span>{translate('auto.components.contribution.heatmap.more', 'More')}</span>
      </div>
    </div>
  )
}

function ContributionCell({ day, metric }: ContributionCellProps): React.JSX.Element {
  const cell = (
    <div
      className={cn(
        'size-2.5 border',
        day.isFuture ? 'border-transparent bg-transparent' : INTENSITY_CLASS[day.intensity]
      )}
      role="gridcell"
      aria-label={day.isFuture ? undefined : formatCellLabel(day, metric)}
    />
  )
  if (day.isFuture) {
    return cell
  }
  return (
    <Tooltip>
      <TooltipTrigger render={cell} />
      <TooltipContent side="top" sideOffset={4}>
        {formatCellLabel(day, metric)}
      </TooltipContent>
    </Tooltip>
  )
}

function formatCellLabel(day: ContributionCalendarDay, metric: ContributionMetric): string {
  const date = day.date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
  return metric === 'activity'
    ? translate(
        'auto.components.contribution.heatmap.activityCell',
        '{{value0}}: {{value1}} activities',
        { value0: date, value1: day.value.toLocaleString() }
      )
    : translate('auto.components.contribution.heatmap.tokenCell', '{{value0}}: {{value1}} tokens', {
        value0: date,
        value1: day.value.toLocaleString()
      })
}
