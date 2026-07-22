import { Pencil, Play, Trash as Trash2 } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'

import { useConfirmationDialog } from '@/components/confirmation-dialog'
import {
  createTerminalQuickCommandDraft,
  TerminalQuickCommandDialog
} from '@/components/terminal-quick-commands/terminal-quick-command-dialog'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { runQuickCommandInNewTab } from '@/lib/run-quick-command-in-new-tab'
import { useAppStore } from '@/store'

import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import {
  getTerminalQuickCommandScope,
  isTerminalQuickCommandComplete
} from '../../../../shared/terminal-quick-commands'
import type { TerminalQuickCommand } from '../../../../shared/types'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree-id'
import { useTabBarQuickCommandsShortcut } from './tab-bar-quick-commands-shortcut'

type TabBarQuickCommandsButtonProps = {
  worktreeId: string
  groupId: string
  moreMenuOpen: boolean
  onMoreMenuOpenChange: (open: boolean) => void
  separatorAfter?: boolean
}

export function TabBarQuickCommandsButton({
  worktreeId,
  groupId,
  moreMenuOpen,
  onMoreMenuOpenChange,
  separatorAfter = false
}: TabBarQuickCommandsButtonProps): React.JSX.Element | null {
  const allCommands = useAppStore((state) => state.settings?.terminalQuickCommands)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const repos = useAppStore((state) => state.repos)
  const confirm = useConfirmationDialog()
  useTabBarQuickCommandsShortcut({
    enabled: true,
    menuOpen: moreMenuOpen,
    onOpenChange: onMoreMenuOpenChange
  })
  // Why: floating terminals use a synthetic worktree id, while quick commands
  // need a real repository target for both saved scope and execution.
  const repoId = useMemo(() => {
    if (worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
      return null
    }
    const candidate = getRepoIdFromWorktreeId(worktreeId)
    return repos.some((repo) => repo.id === candidate) ? candidate : null
  }, [repos, worktreeId])
  const { repoCommands, globalCommands } = useMemo(() => {
    const repoList: TerminalQuickCommand[] = []
    const globalList: TerminalQuickCommand[] = []
    for (const command of allCommands ?? []) {
      if (!isTerminalQuickCommandComplete(command)) {
        continue
      }
      const scope = getTerminalQuickCommandScope(command)
      if (scope.type === 'global') {
        globalList.push(command)
      } else if (scope.type === 'repo' && repoId !== null && scope.repoId === repoId) {
        repoList.push(command)
      }
    }
    return { repoCommands: repoList, globalCommands: globalList }
  }, [allCommands, repoId])
  const [editor, setEditor] = useState<{
    mode: 'add' | 'edit'
    command: TerminalQuickCommand
  } | null>(null)

  if (!repoId) {
    return null
  }

  const addRepoCommand = (): void => {
    setEditor({
      mode: 'add',
      command: createTerminalQuickCommandDraft({ type: 'repo', repoId })
    })
  }
  const handleSaveCommand = (next: TerminalQuickCommand): void => {
    const current = useAppStore.getState().settings?.terminalQuickCommands ?? []
    const isEdit = current.some((command) => command.id === next.id)
    const nextList = isEdit
      ? current.map((command) => (command.id === next.id ? next : command))
      : [...current, next]
    void updateSettings({ terminalQuickCommands: nextList })
  }
  const runCommand = (command: TerminalQuickCommand): void => {
    runQuickCommandInNewTab({ command, worktreeId, groupId })
  }
  const deleteCommand = async (command: TerminalQuickCommand): Promise<void> => {
    const confirmed = await confirm({
      title: translate(
        'auto.components.tab.bar.TabBarQuickCommandsButton.e8e1a52edb',
        'Delete "{{value0}}"?',
        { value0: command.label }
      ),
      description: translate(
        'auto.components.tab.bar.TabBarQuickCommandsButton.3220e2da27',
        'This quick command will be removed from your saved list.'
      ),
      confirmLabel: translate(
        'auto.components.tab.bar.TabBarQuickCommandsButton.be8f0ff166',
        'Delete'
      ),
      confirmVariant: 'destructive'
    })
    if (!confirmed) {
      return
    }
    const current = useAppStore.getState().settings?.terminalQuickCommands ?? []
    void updateSettings({
      terminalQuickCommands: current.filter((candidate) => candidate.id !== command.id)
    })
  }
  const hasCommands = repoCommands.length + globalCommands.length > 0
  const menuEntry = hasCommands ? (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Play className="size-4" />
        {translate('auto.components.tab.bar.TabBarQuickCommandsButton.a2c7a33831', 'Command')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-56">
        {repoCommands.map((command) => (
          <QuickCommandMenuItem
            key={command.id}
            command={command}
            onRun={() => runCommand(command)}
            onEdit={() => setEditor({ mode: 'edit', command })}
            onDelete={() => void deleteCommand(command)}
          />
        ))}
        {repoCommands.length > 0 && globalCommands.length > 0 ? <DropdownMenuSeparator /> : null}
        {globalCommands.map((command) => (
          <QuickCommandMenuItem
            key={command.id}
            command={command}
            onRun={() => runCommand(command)}
            onEdit={() => setEditor({ mode: 'edit', command })}
            onDelete={() => void deleteCommand(command)}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={addRepoCommand}>
          <Play className="size-3.5" />
          {translate('auto.components.tab.bar.TabBarQuickCommandsButton.a2c7a33831', 'Command')}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  ) : (
    <DropdownMenuItem onClick={addRepoCommand}>
      <Play className="size-4" />
      {translate('auto.components.tab.bar.TabBarQuickCommandsButton.a2c7a33831', 'Command')}
    </DropdownMenuItem>
  )

  return (
    <>
      {menuEntry}
      {separatorAfter ? <DropdownMenuSeparator /> : null}
      <TerminalQuickCommandDialog
        open={editor !== null}
        mode={editor?.mode ?? 'add'}
        command={editor?.command ?? createTerminalQuickCommandDraft({ type: 'repo', repoId })}
        repos={repos}
        onOpenChange={(open) => !open && setEditor(null)}
        onSave={handleSaveCommand}
      />
    </>
  )
}

function QuickCommandMenuItem({
  command,
  onRun,
  onEdit,
  onDelete
}: {
  command: TerminalQuickCommand
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <DropdownMenuItem className="group/command" onClick={onRun}>
      <Play className="size-3.5" />
      <span className="min-w-0 flex-1 truncate">{command.label}</span>
      <span className="can-hover:opacity-0 flex shrink-0 items-center gap-0.5 transition-opacity group-hover/command:opacity-100 group-focus/command:opacity-100">
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1"
          aria-label={translate(
            'auto.components.tab.bar.TabBarQuickCommandsButton.15529ede69',
            'Edit {{value0}}',
            { value0: command.label }
          )}
          onClick={(event) => {
            event.stopPropagation()
            onEdit()
          }}
        >
          <Pencil className="size-3" />
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent hover:text-destructive rounded p-1"
          aria-label={translate(
            'auto.components.tab.bar.TabBarQuickCommandsButton.196593b6a9',
            'Remove {{value0}}',
            { value0: command.label }
          )}
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="size-3" />
        </button>
      </span>
    </DropdownMenuItem>
  )
}
