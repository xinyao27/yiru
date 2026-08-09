import { SidebarSimple as PanelRight } from '@phosphor-icons/react'
import { useShortcutLabel } from '~renderer/hooks/use-shortcut-label'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'
import { useAppStore } from '~renderer/store'

import { TabBarOpenInMenuButton } from '../tab-bar/open-in-menu-button'
import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from './right-sidebar-button-styles'

type WorkspaceSidebarToggleButtonProps = {
  onToggle: () => void
  presentation: 'sidebar' | 'titlebar'
  shortcut: string
}

export function WorkspaceSidebarToggleButton({
  onToggle,
  presentation,
  shortcut
}: WorkspaceSidebarToggleButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={presentation === 'sidebar' ? 'ghost' : 'outline-transparent'}
            size={presentation === 'sidebar' ? 'icon-sm' : 'icon-titlebar-wide'}
            className={cn(
              presentation === 'sidebar'
                ? cn(RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME, 'mr-1')
                : 'text-muted-foreground [-webkit-app-region:no-drag]'
            )}
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

export function CollapsedWorkspaceSidebarChrome({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element | null {
  const isOpen = useAppStore((state) => state.rightSidebarOpen)
  const setOpen = useAppStore((state) => state.setRightSidebarOpen)
  const shortcut = useShortcutLabel('sidebar.right.toggle')

  if (isOpen) {
    return null
  }

  return (
    <ButtonGroup className="h-full shrink-0">
      <TabBarOpenInMenuButton worktreeId={worktreeId} />
      <WorkspaceSidebarToggleButton
        presentation="titlebar"
        shortcut={shortcut}
        onToggle={() => setOpen(true)}
      />
    </ButtonGroup>
  )
}
