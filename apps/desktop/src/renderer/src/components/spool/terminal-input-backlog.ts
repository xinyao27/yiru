import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'

export function notifySpoolTerminalInputBacklog(): void {
  toast.warning(
    translate(
      'auto.components.spool.SpoolTerminalPane.inputBacklogFull',
      'Remote input is still catching up. Wait for it to appear before typing or pasting more.'
    ),
    { id: 'spool-terminal-input-backlog-full' }
  )
}
