import { translate } from '../../i18n/translate'
import { parseLaunchAgent } from '../agent/parse'
import { hasFlag, readFlag, requireFlag, requireNonnegativeIntegerFlag } from '../arguments'
import { writeCliOutput } from '../output'
import { connectCliRuntime } from '../runtime/session'

export async function runWorktreeCommand(args: string[]): Promise<void> {
  const [action] = args
  const session = await connectCliRuntime(args)
  try {
    switch (action) {
      case 'archive': {
        const result = await session.client.worktree.archive({
          deleteBranch: hasFlag(args, '--delete-branch'),
          expectedRevision: requireNonnegativeIntegerFlag(args, '--expected-revision'),
          worktree: requireFlag(args, '--worktree')
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          translate('Archived worktree {{worktree}}', {
            worktree: result.archive.originalWorktreeId
          })
        )
        return
      }
      case 'list': {
        const result = await session.client.worktree.list({
          limit: 500,
          repo: readFlag(args, '--repo')
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          result.worktrees
            .map((worktree) => `${worktree.displayName}\t${worktree.branch}\t${worktree.path}`)
            .join('\n') || translate('No worktrees')
        )
        return
      }
      case 'create': {
        const agent = readFlag(args, '--agent')
        const result = await session.client.worktree.create({
          baseBranch: readFlag(args, '--base-branch'),
          expectedRevision: requireNonnegativeIntegerFlag(args, '--expected-revision'),
          name: requireFlag(args, '--name'),
          noParent: hasFlag(args, '--no-parent'),
          repo: requireFlag(args, '--repo'),
          startupAgent: parseLaunchAgent(agent),
          startupCommand: readFlag(args, '--command'),
          startupPrompt: readFlag(args, '--prompt')
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          translate('Created worktree {{worktree}}', { worktree: result.worktree.displayName })
        )
        return
      }
      case 'archives': {
        const result = await session.client.worktree.listArchives({
          repo: readFlag(args, '--repo')
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          result.archives
            .map(
              (archive) => `${archive.id}\t${archive.status}\t${archive.branch}\t${archive.path}`
            )
            .join('\n') || translate('No worktree archives')
        )
        return
      }
      case 'restore': {
        const result = await session.client.worktree.restoreArchive({
          archiveId: requireFlag(args, '--archive'),
          expectedRevision: requireNonnegativeIntegerFlag(args, '--expected-revision')
        })
        writeCliOutput(
          result,
          hasFlag(args, '--json'),
          translate('Restored worktree archive {{archive}}', { archive: result.archive.id })
        )
        return
      }
      default:
        throw new Error('worktree_action_unsupported')
    }
  } finally {
    session.close()
  }
}
