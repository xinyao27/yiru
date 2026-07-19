import { Crosshair } from '@phosphor-icons/react'
import React from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { requestScrollToCurrentWorkspaceReveal } from '@/lib/scroll-to-current-workspace-status'

export function ScrollToCurrentWorkspaceToolbarButton(): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            aria-label={translate(
              'auto.components.sidebar.ScrollToCurrentWorkspaceToolbarButton.23989bb663',
              'Reveal active workspace'
            )}
            onClick={requestScrollToCurrentWorkspaceReveal}
            className="bg-sidebar text-muted-foreground hover:bg-sidebar-accent dark:bg-sidebar dark:hover:bg-sidebar-accent"
          >
            <Crosshair className="size-3.5" />
          </Button>
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        {translate(
          'auto.components.sidebar.ScrollToCurrentWorkspaceToolbarButton.23989bb663',
          'Reveal active workspace'
        )}
      </TooltipContent>
    </Tooltip>
  )
}
