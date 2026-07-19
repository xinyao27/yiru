import { translate } from '@/i18n/i18n'

export type SpoolTerminalConnectionStatus = 'connecting' | 'live' | 'closed' | 'error'

export function getSpoolTerminalStatusLabel(status: SpoolTerminalConnectionStatus): string {
  if (status === 'connecting') {
    return translate('auto.components.spool.SpoolTerminalPane.connecting', 'Connecting terminal…')
  }
  if (status === 'closed') {
    return translate('auto.components.spool.SpoolTerminalPane.closed', 'Terminal closed')
  }
  return translate('auto.components.spool.SpoolTerminalPane.unavailable', 'Terminal unavailable')
}
