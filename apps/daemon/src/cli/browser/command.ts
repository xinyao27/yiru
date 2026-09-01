import { translate } from '../../i18n/translate'
import { hasFlag, readFlag, requireFlag } from '../arguments'
import { writeCliOutput } from '../output'
import { connectCliRuntime } from '../runtime/session'
import type { BrowserCliHandler } from './context'
import { BROWSER_COOKIE_COMMANDS } from './cookies'
import { BROWSER_ENVIRONMENT_COMMANDS } from './environment'
import { hasBrowserCliHelp, printBrowserCliHelp } from './help'
import { browserCommandPositionals } from './input'
import { BROWSER_INTERACTION_COMMANDS } from './interaction'
import { BROWSER_NAVIGATION_COMMANDS } from './navigation'
import { BROWSER_OBSERVABILITY_COMMANDS } from './observability'
import { BROWSER_PROFILE_COMMANDS } from './profiles'
import { BROWSER_STORAGE_COMMANDS } from './storage'
import { BROWSER_TAB_COMMANDS } from './tabs'

const EXTENSION_LAUNCHER_URL =
  'chrome-extension://mfgmfiabfncmdekmikepemddejoeihbf/workspace.html?view=activity&launcher=1'

const BROWSER_CLI_COMMANDS = buildBrowserCliCommands()
const BROWSER_CLI_ROOTS = new Set(
  [...BROWSER_CLI_COMMANDS.keys()].map((commandPath) => commandPath.split(' ')[0])
)

export function isBrowserCliCommand(command: string | undefined): command is string {
  return command !== undefined && BROWSER_CLI_ROOTS.has(command)
}

export async function runBrowserCliCommand(command: string, args: string[]): Promise<void> {
  const commandPath = [command, ...browserCommandPositionals(args)].join(' ')
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    printBrowserCliHelp(commandPath)
    return
  }
  const handler = BROWSER_CLI_COMMANDS.get(commandPath)
  if (!handler) {
    throw new Error(`browser_command_unsupported:${commandPath}`)
  }
  const session = await connectCliRuntime(args)
  try {
    await handler({ args, client: session.client, json: hasFlag(args, '--json') })
  } finally {
    session.close()
  }
}

export async function runBrowserCommand(args: string[]): Promise<void> {
  const [action] = args
  if (action === undefined || action === 'help' || hasFlag(args, '--help') || hasFlag(args, '-h')) {
    printBrowserCliHelp('browser')
    return
  }
  if (action !== 'open') {
    throw new Error('browser_action_unsupported')
  }
  const url = requireBrowserUrl(requireFlag(args, '--url'))
  const projectId = readFlag(args, '--project')
  const worktreeId = readFlag(args, '--worktree')
  const session = await connectCliRuntime(args)
  try {
    const result = await session.client.browserCommand.open({
      ...(projectId ? { projectId } : {}),
      url,
      ...(worktreeId ? { worktreeId } : {})
    })
    const browserWakeRequested = hasFlag(args, '--no-wake') ? false : await wakeExtension()
    const output = { browserWakeRequested, event: result.event }
    writeCliOutput(output, hasFlag(args, '--json'), translate(`Queued ${url}`))
  } finally {
    session.close()
  }
}

function requireBrowserUrl(rawUrl: string): string {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('browser_url_protocol_unsupported')
  }
  return url.href
}

async function wakeExtension(): Promise<boolean> {
  const command = wakeCommand()
  if (!command) {
    return false
  }
  try {
    const process = Bun.spawn(command, { stderr: 'ignore', stdout: 'ignore' })
    return (await process.exited) === 0
  } catch {
    return false
  }
}

function buildBrowserCliCommands(): Map<string, BrowserCliHandler> {
  const commands = new Map<string, BrowserCliHandler>()
  for (const group of [
    BROWSER_NAVIGATION_COMMANDS,
    BROWSER_INTERACTION_COMMANDS,
    BROWSER_TAB_COMMANDS,
    BROWSER_PROFILE_COMMANDS,
    BROWSER_COOKIE_COMMANDS,
    BROWSER_OBSERVABILITY_COMMANDS,
    BROWSER_ENVIRONMENT_COMMANDS,
    BROWSER_STORAGE_COMMANDS
  ]) {
    for (const [path, handler] of Object.entries(group)) {
      if (commands.has(path)) {
        throw new Error(`browser_cli_command_duplicate:${path}`)
      }
      commands.set(path, handler)
    }
  }
  for (const path of commands.keys()) {
    if (!hasBrowserCliHelp(path)) {
      throw new Error(`browser_cli_help_missing:${path}`)
    }
  }
  return commands
}

function wakeCommand(): string[] | null {
  switch (process.platform) {
    case 'darwin':
      return ['open', EXTENSION_LAUNCHER_URL]
    case 'linux':
      return ['xdg-open', EXTENSION_LAUNCHER_URL]
    case 'win32':
      return [
        'powershell.exe',
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Start-Process -FilePath '${EXTENSION_LAUNCHER_URL}'`
      ]
    default:
      return null
  }
}
