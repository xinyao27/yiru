import type {
  GitHistoryOptions,
  GitHistoryResult
} from '@yiru/runtime-protocol/workbench/git/history'
import { loadGitHistoryFromExecutor } from '@yiru/runtime-protocol/workbench/git/history'

import { getLocalGitCapabilityCache } from '../runner/capability-state'
import { gitExecFileAsync } from '../runner/runner'
import type { GitRuntimeOptions } from '../runner/runtime-options'
import { gitOptionsForWorktree } from '../runner/runtime-options'

export async function getHistory(
  worktreePath: string,
  options: GitHistoryOptions & GitRuntimeOptions = {}
): Promise<GitHistoryResult> {
  return loadGitHistoryFromExecutor(
    (args, cwd) => gitExecFileAsync(args, gitOptionsForWorktree(cwd, options)),
    worktreePath,
    options,
    getLocalGitCapabilityCache({ cwd: worktreePath, wslDistro: options.wslDistro })
  )
}
