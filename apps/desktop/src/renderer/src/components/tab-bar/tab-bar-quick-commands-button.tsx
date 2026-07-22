import { Pencil, Play, Trash as Trash2 } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'

import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { Plus } from '@/components/regular-icons'
import {
  createTerminalQuickCommandDraft,
  TerminalQuickCommandDialog
} from '@/components/terminal-quick-commands/terminal-quick-command-dialog'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { runQuickCommandInNewTab } from '@/lib/run-quick-command-in-new-tab'
import { useAppStore } from '@/store'

import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import {
  getTerminalQuickCommandBody,
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editor, setEditor] = useState<{
    mode: 'add' | 'edit'
    command: TerminalQuickCommand
  } | null>(null)
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
  const visibleCommands = useMemo(
    () => [...repoCommands, ...globalCommands],
    [globalCommands, repoCommands]
  )

  if (!repoId) {
    return null
  }

  const openEditor = (mode: 'add' | 'edit', command: TerminalQuickCommand): void => {
    setPickerOpen(false)
    setEditor({ mode, command })
  }
  const addRepoCommand = (): void => {
    openEditor('add', createTerminalQuickCommandDraft({ type: 'repo', repoId }))
  }
  const saveCommand = (next: TerminalQuickCommand): void => {
    const current = useAppStore.getState().settings?.terminalQuickCommands ?? []
    const isEdit = current.some((command) => command.id === next.id)
    void updateSettings({
      terminalQuickCommands: isEdit
        ? current.map((command) => (command.id === next.id ? next : command))
        : [...current, next]
    })
  }
  const runCommand = (command: TerminalQuickCommand): void => {
    setPickerOpen(false)
    runQuickCommandInNewTab({ command, worktreeId, groupId })
  }
  const deleteCommand = async (command: TerminalQuickCommand): Promise<void> => {
    setPickerOpen(false)
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
    if (confirmed) {
      const current = useAppStore.getState().settings?.terminalQuickCommands ?? []
      void updateSettings({
        terminalQuickCommands: current.filter((candidate) => candidate.id !== command.id)
      })
    }
  }
  const hasCommands = visibleCommands.length > 0

  return (
    <>
      <DropdownMenuItem onClick={hasCommands ? () => setPickerOpen(true) : addRepoCommand}>
        <Play className="size-4" />
        {translate('auto.components.tab.bar.TabBarQuickCommandsButton.a2c7a33831', 'Command')}
      </DropdownMenuItem>
      {separatorAfter ? <DropdownMenuSeparator /> : null}
      <CommandDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={translate(
          'auto.components.tab.bar.TabBarQuickCommandsButton.b82e237a4b',
          'More quick commands'
        )}
        description={translate(
          'auto.components.tab.bar.TabBarQuickCommandsButton.f3a8c2d1e7',
          'Search quick commands...'
        )}
        commandProps={{ loop: true }}
      >
        <CommandInput
          autoFocus
          placeholder={translate(
            'auto.components.tab.bar.TabBarQuickCommandsButton.f3a8c2d1e7',
            'Search quick commands...'
          )}
        />
        <CommandList>
          <CommandEmpty>
            {translate(
              'auto.components.tab.bar.TabBarQuickCommandsButton.b4e7f9a2c1',
              'No commands match'
            )}
          </CommandEmpty>
          <CommandGroup
            heading={translate(
              'auto.components.tab.bar.TabBarQuickCommandsButton.a2c7a33831',
              'Command'
            )}
          >
            {visibleCommands.map((command) => (
              <CommandItem
                key={`run:${command.id}`}
                value={`run:${command.id}:${command.label}`}
                keywords={[command.label, getTerminalQuickCommandBody(command)]}
                onSelect={() => runCommand(command)}
              >
                <Play className="size-4" />
                <span className="truncate">{command.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup
            heading={translate(
              'auto.components.settings.QuickCommandsPane.f91b649324',
              'Saved Commands'
            )}
          >
            <CommandItem value="manage:add-command" onSelect={addRepoCommand}>
              <Plus className="size-4" />
              {translate('auto.components.settings.QuickCommandsPane.5aacc8f7dc', 'Add Command')}
            </CommandItem>
            {visibleCommands.map((command) => (
              <CommandItem
                key={`edit:${command.id}`}
                value={`edit:${command.id}:${command.label}`}
                keywords={[command.label, getTerminalQuickCommandBody(command)]}
                onSelect={() => openEditor('edit', command)}
              >
                <Pencil className="size-4" />
                {translate(
                  'auto.components.tab.bar.TabBarQuickCommandsButton.15529ede69',
                  'Edit {{value0}}',
                  { value0: command.label }
                )}
              </CommandItem>
            ))}
            {visibleCommands.map((command) => (
              <CommandItem
                key={`delete:${command.id}`}
                value={`delete:${command.id}:${command.label}`}
                keywords={[command.label, getTerminalQuickCommandBody(command)]}
                onSelect={() => void deleteCommand(command)}
              >
                <Trash2 className="size-4" />
                {translate(
                  'auto.components.tab.bar.TabBarQuickCommandsButton.196593b6a9',
                  'Remove {{value0}}',
                  { value0: command.label }
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <TerminalQuickCommandDialog
        open={editor !== null}
        mode={editor?.mode ?? 'add'}
        command={editor?.command ?? createTerminalQuickCommandDraft({ type: 'repo', repoId })}
        repos={repos}
        onOpenChange={(open) => !open && setEditor(null)}
        onSave={saveCommand}
      />
    </>
  )
}
