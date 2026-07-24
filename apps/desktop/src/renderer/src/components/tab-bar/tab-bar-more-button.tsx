import { DotsThree as MoreHorizontal, X } from '@phosphor-icons/react'
import { getRepoIdFromWorktreeId } from '@yiru/workbench-model/workspace'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { TabBarQuickCommandsButton } from './tab-bar-quick-commands-button'

export function TabBarMoreButton({
  worktreeId,
  groupId,
  onClosePane
}: {
  worktreeId: string
  groupId: string
  onClosePane?: () => void
}): React.JSX.Element | null {
  const worktree = useAppStore((state) => state.getKnownWorktreeById(worktreeId) ?? null)
  const repos = useAppStore((state) => state.repos)
  const canOpenWorktree = Boolean(worktree && worktreeId !== FLOATING_TERMINAL_WORKTREE_ID)
  const canShowQuickCommands =
    canOpenWorktree && repos.some((repo) => repo.id === getRepoIdFromWorktreeId(worktreeId))
  const [menuOpen, setMenuOpen] = useState(false)

  if (!canShowQuickCommands && !onClosePane) {
    return null
  }

  const label = translate('auto.components.tab.bar.TabBarMoreButton.more', 'More')
  return (
    <Tooltip>
      <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
        {/* Why: trailing titlebar actions span the header so their seams align with full-height tabs. */}
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline-transparent"
                  size="icon-titlebar-wide"
                  aria-label={label}
                  className="text-muted-foreground"
                  onClick={(event) => event.stopPropagation()}
                >
                  {/* Why: this compact tab-strip control shares the regular-weight chrome treatment. */}
                  <MoreHorizontal className="size-4" weight="regular" />
                </Button>
              }
            />
          }
        />
        <DropdownMenuContent align="end" side="bottom" sideOffset={4} keepMounted>
          {canShowQuickCommands ? (
            <TabBarQuickCommandsButton
              worktreeId={worktreeId}
              groupId={groupId}
              moreMenuOpen={menuOpen}
              onMoreMenuOpenChange={setMenuOpen}
              separatorAfter={Boolean(onClosePane)}
            />
          ) : null}
          {onClosePane ? (
            <DropdownMenuItem onClick={onClosePane}>
              <X weight="regular" className="size-4" />
              {translate(
                'auto.components.tab.group.TabGroupPanel.closePaneColumn',
                'Close split pane'
              )}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
