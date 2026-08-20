import { formatAgentTypeLabel } from '@yiru/workbench-model/agent'
import { ClockCountdown } from '~renderer/components/icons/hugeicons'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'
import type { RateLimitResumeSchedule } from '~shared/rate-limit-resume/types'

const resumeTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
})

type RateLimitResumeWorkspaceIndicatorProps = {
  worktreeId: string
}

function getNextWorkspaceResume(
  schedules: Record<string, RateLimitResumeSchedule>,
  worktreeId: string
): RateLimitResumeSchedule | null {
  let nextSchedule: RateLimitResumeSchedule | null = null
  for (const schedule of Object.values(schedules)) {
    if (
      schedule.status === 'scheduled' &&
      schedule.worktreeId === worktreeId &&
      (nextSchedule === null || schedule.resumeAt < nextSchedule.resumeAt)
    ) {
      nextSchedule = schedule
    }
  }
  return nextSchedule
}

export function RateLimitResumeWorkspaceIndicator(
  props: RateLimitResumeWorkspaceIndicatorProps
): React.JSX.Element | null {
  const schedule = useAppStore((state) =>
    getNextWorkspaceResume(state.rateLimitResumeByPtyId, props.worktreeId)
  )
  if (!schedule) {
    return null
  }

  const label = translate(
    'rateLimitResume.workspaceIndicator',
    '{{agent}} will automatically continue at {{time}}',
    {
      agent: formatAgentTypeLabel(schedule.agent),
      time: resumeTimeFormatter.format(schedule.resumeAt)
    }
  )

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="text-muted-foreground inline-flex size-4 shrink-0 items-center justify-center"
            aria-label={label}
          >
            <ClockCountdown className="size-3.5" aria-hidden="true" />
          </span>
        }
      />
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
