import { translate } from '../../i18n/translate'
import { hasFlag, readFlag, requireFlag } from '../arguments'
import { writeCliOutput } from '../output'
import { connectCliRuntime } from '../runtime/session'
import { parseLaunchAgent } from './parse'

export async function runAgentCommand(args: string[]): Promise<void> {
  const [action] = args
  const runtime = await connectCliRuntime(args)
  try {
    switch (action) {
      case 'providers': {
        const result = await runtime.client.agentSession.providers({
          hostId: parseHostId(readFlag(args, '--host'))
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          result.providers
            .map(
              (provider) => `${provider.available ? '✓' : '·'}\t${provider.id}\t${provider.label}`
            )
            .join('\n')
        )
        return
      }
      case 'list': {
        const result = await runtime.client.agentSession.list({
          worktreeId: readFlag(args, '--worktree')
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          result.sessions
            .map(
              (session) => `${session.id}\t${session.agent}\t${session.phase}\t${session.status}`
            )
            .join('\n') || translate('No agent sessions')
        )
        return
      }
      case 'start': {
        const agent = parseLaunchAgent(requireFlag(args, '--agent'))
        if (!agent) {
          throw new Error('agent_required')
        }
        const result = await runtime.client.agentSession.start({
          agent,
          prompt: readFlag(args, '--prompt'),
          title: readFlag(args, '--title'),
          worktreeId: requireFlag(args, '--worktree')
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          translate('Started agent session {{session}}', { session: result.session.id })
        )
        return
      }
      case 'followup': {
        const result = await runtime.client.agentSession.followup({
          prompt: requireFlag(args, '--prompt'),
          sessionId: requireFlag(args, '--session')
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          result.accepted ? translate('Follow-up sent') : translate('Follow-up refused')
        )
        return
      }
      case 'stop': {
        const result = await runtime.client.agentSession.stop({
          sessionId: requireFlag(args, '--session')
        })
        writeCliOutput(result, hasFlag(args, '--json'), translate('Agent session stopped'))
        return
      }
      default:
        throw new Error('agent_action_unsupported')
    }
  } finally {
    runtime.close()
  }
}

function parseHostId(value: string | undefined) {
  if (!value) {
    return undefined
  }
  if (value === 'local' || value.startsWith('ssh:') || value.startsWith('wsl:')) {
    return value
  }
  throw new Error('host_id_invalid')
}
