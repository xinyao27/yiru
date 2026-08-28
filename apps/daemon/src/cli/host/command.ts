import { parseExecutionHostId, type ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'

import { translate } from '../../i18n/translate'
import { hasFlag, requireFlag, requireNonnegativeIntegerFlag } from '../arguments'
import { writeCliOutput } from '../output'
import { connectCliRuntime } from '../runtime/session'

export async function runHostCommand(args: string[]): Promise<void> {
  const [action] = args
  const runtime = await connectCliRuntime(args)
  try {
    switch (action) {
      case 'list': {
        const result = await runtime.client.host.list()
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          result.hosts.map((host) => `${host.id}\t${host.kind}\t${host.label}`).join('\n')
        )
        return
      }
      case 'add': {
        const kind = requireHostKind(requireFlag(args, '--kind'))
        const result = await runtime.client.host.add({
          expectedRevision: requireNonnegativeIntegerFlag(args, '--expected-revision'),
          kind,
          label: requireFlag(args, '--label'),
          target: requireFlag(args, '--target')
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          translate('Added host {{host}}', { host: result.host.label })
        )
        return
      }
      case 'probe': {
        const result = await runtime.client.host.probe({
          hostId: requireHostId(requireFlag(args, '--host'))
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          result.capabilities
            .map((capability) => `${capability.available ? '✓' : '·'}\t${capability.name}`)
            .join('\n')
        )
        return
      }
      case 'remove': {
        const result = await runtime.client.host.remove({
          expectedRevision: requireNonnegativeIntegerFlag(args, '--expected-revision'),
          hostId: requireHostId(requireFlag(args, '--host'))
        })
        writeCliOutput(result, hasFlag(args, '--json'), translate('Host removed'))
        return
      }
      default:
        throw new Error('host_action_unsupported')
    }
  } finally {
    runtime.close()
  }
}

function requireHostKind(value: string): 'ssh' | 'wsl' {
  if (value !== 'ssh' && value !== 'wsl') {
    throw new Error('host_kind_invalid')
  }
  return value
}

function requireHostId(value: string): ExecutionHostId {
  const parsed = parseExecutionHostId(value)
  if (!parsed || parsed.kind === 'runtime') {
    throw new Error('host_id_invalid')
  }
  return parsed.id
}
