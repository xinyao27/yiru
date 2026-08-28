import { translate } from '../../i18n/translate'
import { hasFlag, readFlag, requireFlag } from '../arguments'
import { writeCliOutput } from '../output'
import { connectCliRuntime } from '../runtime/session'

export async function runEventsCommand(args: string[]): Promise<void> {
  const [action] = args
  const scope = requireFlag(args, '--scope')
  const afterId = parseAfterId(readFlag(args, '--after'))
  const session = await connectCliRuntime(args)
  try {
    if (action === 'list') {
      const result = await session.client.workspaceEvents.list({ afterId, limit: 500, scope })
      writeCliOutput(
        result,
        hasFlag(args, '--json'),
        result.events.map((event) => JSON.stringify(event)).join('\n') || translate('No events')
      )
      return
    }
    if (action === 'watch') {
      await watchEvents(session.client, scope, afterId)
      return
    }
    throw new Error('events_action_unsupported')
  } finally {
    session.close()
  }
}

async function watchEvents(
  client: Awaited<ReturnType<typeof connectCliRuntime>>['client'],
  scope: string,
  initialAfterId: number
): Promise<void> {
  const events = await client.workspaceEvents.subscribe({ afterId: initialAfterId, scope })
  for await (const message of events) {
    if (message.type === 'event') {
      console.log(JSON.stringify(message.event))
    }
  }
}

function parseAfterId(value: string | undefined): number {
  if (value === undefined) {
    return 0
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('events_after_id_invalid')
  }
  return parsed
}
