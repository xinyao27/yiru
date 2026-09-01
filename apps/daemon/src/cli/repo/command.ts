import { translate } from '../../i18n/translate'
import { hasFlag, readFlag, requireNonnegativeIntegerFlag } from '../arguments'
import { writeCliOutput } from '../output'
import { connectCliRuntime } from '../runtime/session'

export async function runRepoCommand(args: string[]): Promise<void> {
  const [action] = args
  const session = await connectCliRuntime(args)
  try {
    switch (action) {
      case 'list': {
        const result = await session.client.repo.list()
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          result.repos.map((repo) => `${repo.displayName}\t${repo.path}`).join('\n') ||
            translate('No projects')
        )
        return
      }
      case 'add': {
        const path = readFlag(args, '--path') ?? args[1]
        if (!path) {
          throw new Error('project_path_required')
        }
        const result = await session.client.repo.add({
          expectedRevision: requireNonnegativeIntegerFlag(args, '--expected-revision'),
          hostId: parseHostId(readFlag(args, '--host')),
          kind: hasFlag(args, '--folder') ? 'folder' : 'git',
          path
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          translate('Added {{project}}', { project: result.repo.displayName })
        )
        return
      }
      default:
        throw new Error('repo_action_unsupported')
    }
  } finally {
    session.close()
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
