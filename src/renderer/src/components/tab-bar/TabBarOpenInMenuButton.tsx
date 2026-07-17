import { FolderOpen } from '@phosphor-icons/react'
import { WorktreeOpenInMenuContent } from '@/components/sidebar/WorktreeOpenInMenu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
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

  if (!worktree || worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
    return null
  }

  const label = translate('auto.components.sidebar.WorktreeOpenInMenu.8009ab69a6', 'Open in')

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="my-auto flex h-7 shrink-0 items-center gap-1 px-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={label}
          >
            <FolderOpen className="size-4" />
            <span className="text-[12px] font-medium">{label}</span>
          </button>
        }
      />
      <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="w-52">
        <WorktreeOpenInMenuContent
          worktreePath={worktree.path}
          connectionId={repo?.connectionId ?? null}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
