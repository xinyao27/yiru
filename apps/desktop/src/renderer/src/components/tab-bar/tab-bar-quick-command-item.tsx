import { Pencil, Play, Trash as Trash2 } from '@phosphor-icons/react'

import { CommandItem } from '@/components/ui/command'
import { translate } from '@/i18n/i18n'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'

import { isTerminalAgentQuickCommand } from '../../../../shared/terminal-quick-commands'
import type { TerminalQuickCommand } from '../../../../shared/types'

type TabBarQuickCommandItemProps = {
  command: TerminalQuickCommand
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
}

export function TabBarQuickCommandItem({
  command,
  onRun,
  onEdit,
  onDelete
}: TabBarQuickCommandItemProps): React.JSX.Element {
  return (
    <CommandItem
      value={command.id}
      onSelect={onRun}
      className="group/qc data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground mx-1 my-0.5 items-center gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5"
    >
      {isTerminalAgentQuickCommand(command) ? (
        <span className="text-muted-foreground shrink-0">
          <AgentIcon agent={command.agent} size={12} />
        </span>
      ) : (
        <Play
          className="text-muted-foreground size-3 shrink-0"
          fill="currentColor"
          strokeWidth={0}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate font-medium">{command.label}</span>
        <span className="text-muted-foreground block truncate font-mono text-[11px]">
          {isTerminalAgentQuickCommand(command)
            ? `${getAgentLabel(command.agent)}: ${command.prompt}`
            : command.command}
        </span>
      </span>
      <span className="can-hover:opacity-0 flex shrink-0 items-center gap-0.5 transition-opacity group-hover/qc:opacity-100 group-data-[selected=true]/qc:opacity-100">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onEdit()
          }}
          className="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1"
          aria-label={translate(
            'auto.components.tab.bar.TabBarQuickCommandsButton.15529ede69',
            'Edit {{value0}}',
            { value0: command.label }
          )}
        >
          <Pencil className="size-3" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          className="text-muted-foreground hover:bg-accent hover:text-destructive rounded p-1"
          aria-label={translate(
            'auto.components.tab.bar.TabBarQuickCommandsButton.196593b6a9',
            'Remove {{value0}}',
            { value0: command.label }
          )}
        >
          <Trash2 className="size-3" />
        </button>
      </span>
    </CommandItem>
  )
}
