import { useSyncExternalStore } from 'react'
import { SidebarSimple as PanelRight } from '~renderer/components/icons/hugeicons'
import { Button } from '~renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { translate } from '~renderer/i18n/i18n'

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
  onToggle: () => void
  shortcut: string
}

export function WorkspaceSidebarToggleButton({
  onToggle,
  shortcut
}: WorkspaceSidebarToggleButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="titlebar-segment"
            size="icon-titlebar-wide"
            className="[-webkit-app-region:no-drag]"
            onClick={onToggle}
            aria-label={translate(
              'auto.components.right.sidebar.index.e8e2e4ce74',
              'Toggle right sidebar'
            )}
          >
            <PanelRight className="-scale-x-100" />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {translate(
          'auto.components.right.sidebar.index.9fffaf17c1',
          'Toggle right sidebar ({{value0}})',
          { value0: shortcut }
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
  return <div className="h-full shrink-0 [-webkit-app-region:no-drag]" style={{ width }} />
}
