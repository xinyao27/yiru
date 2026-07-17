import { CaretDown, FolderOpen } from '@phosphor-icons/react'
import {
  getLocalFileManagerLabel,
  getPreferredWorktreeOpenInEntry,
  getWorktreeOpenInEntries,
  openWorktreePath,
  type OpenInMenuEntry,
  WorktreeOpenInMenuContent
} from '@/components/sidebar/WorktreeOpenInMenu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { OpenInApplicationIcon } from '@/lib/open-in-app-catalog'
import { useRepoById } from '@/store/selectors'
import { useAppStore } from '@/store'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'

export function TabBarOpenInMenuButton({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element | null {
  const worktree = useAppStore((state) => state.getKnownWorktreeById(worktreeId) ?? null)
  const repo = useRepoById(worktree?.repoId ?? null)
  const openInApplications = useAppStore((state) => state.settings?.openInApplications ?? [])
  const lastOpenInTargetKey = useAppStore((state) => state.settings?.lastOpenInTargetKey)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const entries = getWorktreeOpenInEntries(openInApplications, getLocalFileManagerLabel())
  const preferredEntry = getPreferredWorktreeOpenInEntry(entries, lastOpenInTargetKey)

  if (!worktree || worktreeId === FLOATING_TERMINAL_WORKTREE_ID || !preferredEntry) {
    return null
  }

  const openLabel = translate(
    'auto.components.tab.bar.TabBarOpenInMenuButton.3f5d946e01',
    'Open in {{value0}}',
    { value0: preferredEntry.label }
  )
  const chooseLabel = translate(
    'auto.components.tab.bar.TabBarOpenInMenuButton.50ec9a165e',
    'Choose application'
  )

  const openEntry = (entry: OpenInMenuEntry): void => {
    void openWorktreePath({
      target: entry.target,
      worktreePath: worktree.path,
      connectionId: repo?.connectionId ?? null,
      command: entry.command
    })
  }

  const rememberEntry = (entry: OpenInMenuEntry): void => {
    if (entry.preferenceKey !== lastOpenInTargetKey) {
      // Why: the left half is a repeat action, so menu choices must survive relaunches.
      void updateSettings({ lastOpenInTargetKey: entry.preferenceKey })
    }
  }

  return (
    <DropdownMenu modal={false}>
      <ButtonGroup className="my-auto shrink-0" aria-label={openLabel}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                className="size-7 border-border/55 bg-background/35 text-muted-foreground shadow-none hover:bg-accent/50 hover:text-foreground"
                aria-label={openLabel}
                onClick={() => openEntry(preferredEntry)}
              >
                {preferredEntry.target === 'file-manager' ? (
                  <FolderOpen className="size-3.5" />
                ) : (
                  <OpenInApplicationIcon
                    application={{ command: preferredEntry.command ?? '' }}
                    size={14}
                  />
                )}
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {openLabel}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    className="h-7 w-6 border-border/55 bg-background/35 text-muted-foreground shadow-none hover:bg-accent/50 hover:text-foreground"
                    aria-label={chooseLabel}
                  >
                    <CaretDown className="size-3" />
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {chooseLabel}
          </TooltipContent>
        </Tooltip>
      </ButtonGroup>
      <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="w-52">
        <WorktreeOpenInMenuContent
          worktreePath={worktree.path}
          connectionId={repo?.connectionId ?? null}
          onEntryOpen={rememberEntry}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
