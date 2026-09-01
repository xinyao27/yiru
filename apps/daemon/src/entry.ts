import { selectEntryCommand } from './cli/command'
import { DaemonArgumentError } from './cli/daemon-options'
import { translate } from './i18n/translate'
import { CODEX_GRANT_ENTRY_COMMAND, WARP_THEME_PARSE_ENTRY_COMMAND } from './runtime/internal-entry'
import { waitForRestartParent } from './server/restart'
import { startDaemon } from './server/start'

function reportDaemonFailure(error: unknown): never {
  console.error(
    `[daemon] ${translate('Runtime host failed')}:`,
    error instanceof DaemonArgumentError ? error.message : error
  )
  process.exit(1)
}

if (process.argv[2] === CODEX_GRANT_ENTRY_COMMAND) {
  await (
    await import('./agents/codex/app-server-grant-entry')
  )
    .runCodexAppServerGrantEntry()
    .catch(reportDaemonFailure)
} else if (process.argv[2] === WARP_THEME_PARSE_ENTRY_COMMAND) {
  await (
    await import('./warp-themes/parser-entry')
  )
    .runWarpThemeParserEntry()
    .catch(reportDaemonFailure)
} else {
  await waitForRestartParent().catch(reportDaemonFailure)
  const command = selectEntryCommand(process.argv.slice(2))
  process.argv = [process.argv[0], process.argv[1], ...command.argv]

  switch (command.kind) {
    case 'daemon':
      await startDaemon(command.argv).catch(reportDaemonFailure)
      break
    case 'native-host':
      await (await import('./native-messaging/host')).runNativeMessagingHost(command.argv)
      break
    case 'native-install': {
      const { installNativeMessagingHost } = await import('./native-messaging/install')
      installNativeMessagingHost(command.argv)
      break
    }
    case 'cli':
      await (
        await import('./cli/run')
      )
        .runCli(command.argv)
        .catch((await import('./cli/output')).reportCliError)
      break
  }
}
