import { useSyncExternalStore } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { SidebarSimple as Panel } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

let workspaceSidebarChromeWidth = 0
const workspaceSidebarChromeWidthListeners = new Set<() => void>()

function subscribeToWorkspaceSidebarChromeWidth(listener: () => void): () => void {
  workspaceSidebarChromeWidthListeners.add(listener)
  return () => workspaceSidebarChromeWidthListeners.delete(listener)
}

export function setWorkspaceSidebarChromeWidth(width: number): void {
  if (workspaceSidebarChromeWidth === width) {
    return
  }
  workspaceSidebarChromeWidth = width
  for (const listener of workspaceSidebarChromeWidthListeners) {
    listener()
  }
}

type WorkspaceSidebarToggleButtonProps = {
  mergeTrailingEdge?: boolean
  onToggle: () => void
  placement: 'left' | 'right'
  shortcut: string
}

export function WorkspaceSidebarToggleButton({
  mergeTrailingEdge = false,
  onToggle,
  placement,
  shortcut
}: WorkspaceSidebarToggleButtonProps): React.JSX.Element {
  const accessibleLabel =
    placement === 'left'
      ? translate('workspace.sidebar.toggleLeft', 'Toggle left workspace sidebar')
      : translate('workspace.sidebar.toggleRight', 'Toggle right workspace sidebar')
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="titlebar-segment"
            size="icon-titlebar-wide"
            className={mergeTrailingEdge ? 'border-r-0' : undefined}
            onClick={onToggle}
            aria-label={accessibleLabel}
          >
            <Panel className={placement === 'right' ? '-scale-x-100' : undefined} />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {placement === 'left'
          ? translate(
              'workspace.sidebar.toggleLeftShortcut',
              'Toggle left workspace sidebar ({{value0}})',
              {
                value0: shortcut
              }
            )
          : translate(
              'workspace.sidebar.toggleRightShortcut',
              'Toggle right workspace sidebar ({{value0}})',
              {
                value0: shortcut
              }
            )}
      </TooltipContent>
    </Tooltip>
  )
}

export function WorkspaceSidebarChromeSpacer(): React.JSX.Element {
  const width = useSyncExternalStore(
    subscribeToWorkspaceSidebarChromeWidth,
    () => workspaceSidebarChromeWidth,
    () => 0
  )
  return <div className="h-full shrink-0" style={{ width }} />
}
