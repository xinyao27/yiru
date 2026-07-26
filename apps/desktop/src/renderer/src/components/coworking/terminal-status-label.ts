import { translate } from '@/i18n/i18n'

export type CoworkingTerminalConnectionStatus = 'connecting' | 'live' | 'closed' | 'error'

export function getCoworkingTerminalStatusLabel(status: CoworkingTerminalConnectionStatus): string {
  if (status === 'connecting') {
    return translate(
      'auto.components.coworking.CoworkingTerminalPane.connecting',
      'Connecting terminal…'
    )
  }
  if (status === 'closed') {
    return translate('auto.components.coworking.CoworkingTerminalPane.closed', 'Terminal closed')
  }
  return translate(
    'auto.components.coworking.CoworkingTerminalPane.unavailable',
    'Terminal unavailable'
  )
}
