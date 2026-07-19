import { Warning as AlertTriangle } from '@phosphor-icons/react'
import type { JSX } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

export function DeleteWorktreeDirtyChangeHint({
  changeCount
}: {
  changeCount: number | undefined
}): JSX.Element | null {
  if (changeCount === undefined) {
    return null
  }

  const label =
    changeCount > 0
      ? `${changeCount} uncommitted or untracked ${changeCount === 1 ? 'change' : 'changes'}`
      : 'Uncommitted or untracked changes'

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="text-destructive mt-1 flex w-fit max-w-full items-center gap-1.5">
            <AlertTriangle className="size-3 shrink-0" />
            <span className="min-w-0 truncate font-medium">{label}</span>
          </div>
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        {translate(
          'auto.components.sidebar.DeleteWorktreeDirtyChangeHint.8e2994ce28',
          'Deleting this workspace permanently removes these changes from disk.'
        )}
      </TooltipContent>
    </Tooltip>
  )
}
