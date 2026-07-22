import { DotsThree as MoreHorizontal, X } from '@phosphor-icons/react'
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
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree-id'
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
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  aria-label={label}
                  className="text-muted-foreground hover:text-foreground my-auto size-7 shrink-0"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
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
              <X className="size-4" />
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
