import { DotsThree as MoreHorizontal } from '@phosphor-icons/react'

import {
  WorktreeOpenInSubMenu,
  type OpenInMenuEntry
} from '@/components/sidebar/worktree-open-in-menu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useRepoById } from '@/store/selectors'

import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { X } from '../regular-icons'

export function TabBarMoreButton({
  worktreeId,
  onClosePane
}: {
  worktreeId: string
  onClosePane?: () => void
}): React.JSX.Element | null {
  const worktree = useAppStore((state) => state.getKnownWorktreeById(worktreeId) ?? null)
  const repo = useRepoById(worktree?.repoId ?? null)
  const lastOpenInTargetKey = useAppStore((state) => state.settings?.lastOpenInTargetKey)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const canOpenWorktree = Boolean(worktree && worktreeId !== FLOATING_TERMINAL_WORKTREE_ID)

  if (!canOpenWorktree && !onClosePane) {
    return null
  }

  const label = translate('auto.components.tab.bar.TabBarMoreButton.more', 'More')
  const rememberOpenInEntry = (entry: OpenInMenuEntry): void => {
    if (entry.preferenceKey !== lastOpenInTargetKey) {
      void updateSettings({ lastOpenInTargetKey: entry.preferenceKey })
    }
  }

  return (
    <Tooltip>
      <DropdownMenu modal={false}>
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
        <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
          {canOpenWorktree && worktree ? (
            <WorktreeOpenInSubMenu
              worktreePath={worktree.path}
              connectionId={repo?.connectionId ?? null}
              onEntryOpen={rememberOpenInEntry}
            />
          ) : null}
          {canOpenWorktree && onClosePane ? <DropdownMenuSeparator /> : null}
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
