import React from 'react'
import { Crosshair } from '~renderer/components/icons/hugeicons'
import { requestScrollToCurrentWorkspaceReveal } from '~renderer/components/sidebar/scroll-to-current-workspace-status'
import { Button } from '~renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { translate } from '~renderer/i18n/i18n'

export function ScrollToCurrentWorkspaceToolbarButton(): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="quiet"
            size="icon-sm"
            type="button"
            aria-label={translate(
              'auto.components.sidebar.ScrollToCurrentWorkspaceToolbarButton.23989bb663',
              'Reveal active workspace'
            )}
            onClick={requestScrollToCurrentWorkspaceReveal}
          >
            <Crosshair className="size-4" />
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
