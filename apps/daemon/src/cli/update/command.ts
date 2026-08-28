import { translate } from '../../i18n/translate'
import { installLatestDaemon } from '../../updates/installer'
import { DaemonUpdateService } from '../../updates/service'
import { hasFlag } from '../arguments'
import { writeCliOutput } from '../output'

export async function runUpdateCommand(args: string[]): Promise<void> {
  if (hasFlag(args, '--check')) {
    const status = await new DaemonUpdateService().check(true)
    writeCliOutput(
      status,
      hasFlag(args, '--json'),
      status.updateAvailable && status.latestVersion
        ? translate('Yiru {{version}} is available; run {{command}}', {
            command: status.installCommand,
            version: status.latestVersion
          })
        : translate('Yiru is up to date')
    )
    return
  }
  const result = await installLatestDaemon()
  writeCliOutput(
    result,
    hasFlag(args, '--json'),
    result.installed
      ? translate('Installed Yiru {{version}} and restarted the service', {
          version: result.version
        })
      : translate('Yiru is already up to date')
  )
}
