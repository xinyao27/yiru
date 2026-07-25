import type { GitHistoryOptions, GitHistoryResult } from '../../shared/git-history'
import { loadGitHistoryFromExecutor } from '../../shared/git-history'
import { gitExecFileAsync } from './runner'
import type { GitRuntimeOptions } from './runtime-options'
import { gitOptionsForWorktree } from './runtime-options'

export async function getHistory(
  worktreePath: string,
  options: GitHistoryOptions & GitRuntimeOptions = {}
): Promise<GitHistoryResult> {
  return loadGitHistoryFromExecutor(
    (args, cwd) => gitExecFileAsync(args, gitOptionsForWorktree(cwd, options)),
    worktreePath,
    options
  )
}
