import { translate } from '../i18n/translate'
import { getDaemonVersion } from '../runtime/paths'
import { runAgentCommand } from './agent/command'
import { isBrowserCliCommand, runBrowserCliCommand, runBrowserCommand } from './browser/command'
import { hasBrowserCliHelp, printBrowserCliHelp } from './browser/help'
import { browserCommandPositionals } from './browser/input'
import { printComputerHelp, runComputerCommand } from './computer/command'
import { runConnectionCommand } from './connection/command'
import { runEventsCommand } from './events/command'
import { runHostCommand } from './host/command'
import { runInstallCommand } from './install/command'
import { runLayoutCommand } from './layout/command'
import { runMobileCommand } from './mobile/command'
import { runRepoCommand } from './repo/command'
import { runServiceCommand } from './service/command'
import { runSkillsCommand } from './skills/command'
import { runStatusCommand } from './status/command'
import { runTerminalCommand } from './terminal/command'
import { runUpdateCommand } from './update/command'
import { runWorktreeCommand } from './worktree/command'

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...args] = argv
  if (command === '--version' || command === '-v' || command === 'version') {
    console.log(getDaemonVersion())
    return
  }
  if (isBrowserCliCommand(command)) {
    await runBrowserCliCommand(command, args)
    return
  }
  switch (command) {
    case 'agent':
      await runAgentCommand(args)
      return
    case 'browser':
      await runBrowserCommand(args)
      return
    case 'status':
      runStatusCommand(args)
      return
    case 'connection':
      runConnectionCommand(args)
      return
    case 'computer':
      await runComputerCommand(args)
      return
    case 'events':
      await runEventsCommand(args)
      return
    case 'host':
      await runHostCommand(args)
      return
    case 'install':
      await runInstallCommand(args)
      return
    case 'layout':
      await runLayoutCommand(args)
      return
    case 'service':
      runServiceCommand(args)
      return
    case 'skills':
      await runSkillsCommand(args)
      return
    case 'repo':
      await runRepoCommand(args)
      return
    case 'worktree':
      await runWorktreeCommand(args)
      return
    case 'terminal':
      await runTerminalCommand(args)
      return
    case 'mobile':
      await runMobileCommand(args)
      return
    case 'update':
      await runUpdateCommand(args)
      return
    case 'help':
      if (args[0] === 'browser') {
        printBrowserCliHelp('browser')
        return
      }
      if (args[0] === 'computer') {
        printComputerHelp()
        return
      }
      if (args[0]) {
        const commandPath = browserCommandPositionals(args).join(' ')
        if (hasBrowserCliHelp(commandPath)) {
          printBrowserCliHelp(commandPath)
          return
        }
      }
      console.log(
        translate(
          'Usage: yiru <install|status|service|connection|events|host|repo|worktree|layout|terminal|agent|browser|computer|mobile|skills|update|daemon|native-messaging> [options]'
        )
      )
      return
    case '--help':
    case '-h':
    case undefined:
      console.log(
        translate(
          'Usage: yiru <install|status|service|connection|events|host|repo|worktree|layout|terminal|agent|browser|computer|mobile|skills|update|daemon|native-messaging> [options]'
        )
      )
      return
    default:
      throw new Error(`cli_command_unsupported:${command}`)
  }
}
