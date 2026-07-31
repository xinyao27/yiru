import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'

export function notifyCoworkingTerminalInputBacklog(): void {
  toast.warning(
    translate(
      'auto.components.coworking.CoworkingTerminalPane.inputBacklogFull',
      'Remote input is still catching up. Wait for it to appear before typing or pasting more.'
    ),
    { id: 'coworking-terminal-input-backlog-full' }
  )
}
