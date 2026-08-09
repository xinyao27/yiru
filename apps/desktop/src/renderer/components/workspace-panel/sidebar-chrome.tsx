import { SidebarSimple as PanelRight } from '@phosphor-icons/react'
import { TabBarOpenInMenuButton } from '~renderer/components/tab-bar/open-in-menu-button'
import { Button } from '~renderer/components/ui/button'
import { ButtonGroup } from '~renderer/components/ui/button-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { translate } from '~renderer/i18n/i18n'

export const WORKSPACE_SIDEBAR_CHROME_WIDTH_PROPERTY = '--workspace-sidebar-chrome-width'

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
            variant={presentation === 'sidebar' ? 'sidebar-quiet' : 'titlebar-segment'}
            size={presentation === 'sidebar' ? 'icon-sm' : 'icon-titlebar-wide'}
            className={presentation === 'sidebar' ? 'mr-1' : '[-webkit-app-region:no-drag]'}
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
  onOpen,
  shortcut,
  worktreeId
}: {
  onOpen: () => void
  shortcut: string
  worktreeId: string
}): React.JSX.Element {
  return (
    <ButtonGroup presentation="titlebar" className="shrink-0">
      <TabBarOpenInMenuButton worktreeId={worktreeId} />
      <WorkspaceSidebarToggleButton presentation="titlebar" shortcut={shortcut} onToggle={onOpen} />
    </ButtonGroup>
  )
}

export function WorkspaceSidebarChromeSpacer(): React.JSX.Element {
  return (
    <div
      className="h-full shrink-0 [-webkit-app-region:no-drag]"
      style={{ width: `var(${WORKSPACE_SIDEBAR_CHROME_WIDTH_PROPERTY}, 0px)` }}
    />
  )
}
