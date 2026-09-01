import { translate } from '../../i18n/translate'
import {
  installDaemonService,
  readDaemonServiceState,
  uninstallDaemonService
} from '../../service/manager'
import { hasFlag } from '../arguments'
import { writeCliOutput } from '../output'

export function runServiceCommand(args: string[]): void {
  const [action] = args
  switch (action) {
    case 'install':
      installDaemonService()
      writeCliOutput(
        { state: readDaemonServiceState() },
        hasFlag(args, '--json'),
        translate('Yiru daemon service installed and started')
      )
      return
    case 'uninstall':
      uninstallDaemonService()
      writeCliOutput(
        { state: 'not_installed' },
        hasFlag(args, '--json'),
        translate('Yiru daemon service uninstalled')
      )
      return
    case 'status': {
      const state = readDaemonServiceState()
      writeCliOutput(
        { state },
        hasFlag(args, '--json'),
        translate('Yiru daemon service state: {{state}}', { state })
      )
      return
    }
    default:
      throw new Error('service_action_unsupported')
  }
}
