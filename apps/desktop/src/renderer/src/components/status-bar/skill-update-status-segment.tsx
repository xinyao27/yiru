import {
  WarningCircle as AlertCircle,
  CheckCircle as CheckCircle2,
  ArrowClockwise as RefreshCw
} from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

import { requestSkillFreshnessUpdateDialog } from '../skills/skill-freshness-update-dialog-request'
import { useSkillUpdateRun } from '../skills/skill-update-run-store'

export function SkillUpdateStatusSegment(): React.JSX.Element | null {
  const run = useSkillUpdateRun()
  if (run.state === 'idle') {
    return null
  }

  const segment =
    run.state === 'running'
      ? {
          icon: (
            <RefreshCw weight="regular" className="text-muted-foreground size-3 animate-spin" />
          ),
          label: run.stopping
            ? translate(
                'auto.components.status.bar.SkillUpdateStatusSegment.stoppingLabel',
                'Stopping skill update'
              )
            : translate(
                'auto.components.status.bar.SkillUpdateStatusSegment.runningLabel',
                'Updating skills'
              )
        }
      : run.state === 'success'
        ? {
            icon: <CheckCircle2 weight="regular" className="text-muted-foreground size-3" />,
            label: translate(
              'auto.components.status.bar.SkillUpdateStatusSegment.successLabel',
              'Skills updated'
            )
          }
        : {
            icon: <AlertCircle weight="regular" className="text-destructive size-3" />,
            label: translate(
              'auto.components.status.bar.SkillUpdateStatusSegment.errorLabel',
              'Skill update failed'
            )
          }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="status-bar-icon"
            size="icon-status-bar-wide"
            type="button"
            onClick={requestSkillFreshnessUpdateDialog}
            aria-label={segment.label}
          >
            {segment.icon}
          </Button>
        }
      />
      <TooltipContent side="top" sideOffset={6}>
        {segment.label}
      </TooltipContent>
    </Tooltip>
  )
}
