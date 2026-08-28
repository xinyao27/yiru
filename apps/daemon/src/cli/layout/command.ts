import { translate } from '../../i18n/translate'
import { hasFlag, requireFlag, requireNonnegativeIntegerFlag } from '../arguments'
import { writeCliOutput } from '../output'
import { connectCliRuntime } from '../runtime/session'

export async function runLayoutCommand(args: string[]): Promise<void> {
  const [action] = args
  const runtime = await connectCliRuntime(args)
  try {
    if (action === 'list') {
      const result = await runtime.client.layout.list({ worktree: requireFlag(args, '--worktree') })
      writeCliOutput(
        result,
        hasFlag(args, '--json'),
        result.recipes.map((recipe) => `${recipe.name}\t${recipe.panes.length}`).join('\n') ||
          translate('No layout recipes')
      )
      return
    }
    if (action === 'apply') {
      const result = await runtime.client.layout.apply({
        expectedRevision: requireNonnegativeIntegerFlag(args, '--expected-revision'),
        name: requireFlag(args, '--name'),
        worktree: requireFlag(args, '--worktree')
      })
      writeCliOutput(
        result,
        hasFlag(args, '--json'),
        translate('Started {{count}} layout panes', { count: result.panes.length })
      )
      return
    }
    throw new Error('layout_action_unsupported')
  } finally {
    runtime.close()
  }
}
