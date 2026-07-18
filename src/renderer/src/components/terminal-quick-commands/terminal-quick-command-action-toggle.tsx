import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { TerminalQuickCommandDialogAction } from './terminal-quick-command-dialog-draft'
import { QUICK_COMMAND_TOGGLE_ITEM_CLASS } from './terminal-quick-command-toggle-style'
import { translate } from '@/i18n/i18n'

type TerminalQuickCommandActionToggleProps = {
  selectedAction: TerminalQuickCommandDialogAction
  onActionChange: (action: TerminalQuickCommandDialogAction) => void
}

export function TerminalQuickCommandActionToggle({
  selectedAction,
  onActionChange
}: TerminalQuickCommandActionToggleProps): React.JSX.Element {
  return (
    <ToggleGroup
      value={[selectedAction]}
      onValueChange={(value) => {
        const next = value[0]
        if (next === 'terminal-command' || next === 'agent-prompt') {
          onActionChange(next)
        }
      }}
      className="justify-start"
      variant="outline"
    >
      <ToggleGroupItem value="terminal-command" className={QUICK_COMMAND_TOGGLE_ITEM_CLASS}>
        {translate(
          'auto.components.terminal.quick.commands.TerminalQuickCommandActionToggle.b5ea4d64f6',
          'Terminal Command'
        )}
      </ToggleGroupItem>
      <ToggleGroupItem value="agent-prompt" className={QUICK_COMMAND_TOGGLE_ITEM_CLASS}>
        {translate(
          'auto.components.terminal.quick.commands.TerminalQuickCommandActionToggle.b0d58e37ed',
          'Agent Prompt'
        )}
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
