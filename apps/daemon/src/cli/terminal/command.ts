import { translate } from '../../i18n/translate'
import { parseLaunchAgent } from '../agent/parse'
import { hasFlag, readFlag, requireFlag } from '../arguments'
import { writeCliOutput } from '../output'
import { connectCliRuntime } from '../runtime/session'

export async function runTerminalCommand(args: string[]): Promise<void> {
  const [action] = args
  const session = await connectCliRuntime(args)
  try {
    switch (action) {
      case 'list': {
        const result = await session.client.terminal.list({
          limit: 500,
          worktree: readFlag(args, '--worktree')
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          result.terminals
            .map((terminal) => `${terminal.handle}\t${terminal.title ?? terminal.preview}`)
            .join('\n') || translate('No terminals')
        )
        return
      }
      case 'create': {
        const agent = readFlag(args, '--agent')
        const command = readFlag(args, '--command') ?? agent
        const result = await session.client.terminal.create({
          command,
          launchAgent: parseLaunchAgent(agent),
          presentation: 'background',
          rendererBacked: false,
          title: readFlag(args, '--title'),
          worktree: requireFlag(args, '--worktree')
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          translate('Created terminal {{terminal}}', { terminal: result.terminal.handle })
        )
        return
      }
      case 'read': {
        const result = await session.client.terminal.read({
          limit: Number(readFlag(args, '--limit') ?? 500),
          terminal: requireFlag(args, '--terminal')
        })
        writeCliOutput(result, hasFlag(args, '--json'), result.terminal.tail.join('\n'))
        return
      }
      case 'send': {
        const result = await session.client.terminal.send({
          client: { id: `cli-${process.pid}`, type: 'cli' },
          enter: hasFlag(args, '--enter'),
          interrupt: hasFlag(args, '--interrupt'),
          terminal: requireFlag(args, '--terminal'),
          text: readFlag(args, '--text')
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          result.send.accepted ? translate('Input sent') : translate('Input refused')
        )
        return
      }
      case 'close': {
        const result = await session.client.terminal.close({
          terminal: requireFlag(args, '--terminal')
        })
        writeCliOutput(result, hasFlag(args, '--json'), translate('Terminal closed'))
        return
      }
      default:
        throw new Error('terminal_action_unsupported')
    }
  } finally {
    session.close()
  }
}
