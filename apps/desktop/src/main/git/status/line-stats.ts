import {
  collectUntrackedAdditions,
  applyLineStats,
  parseNumstat,
  type GitLineStats
} from '~shared/git/uncommitted-line-stats'
import type { GitStatusEntry } from '~shared/types'

import { gitExecFileAsync, gitOptionalLocksDisabledEnv } from '../runner'
import type { GitRuntimeOptions } from '../runtime-options'
import { gitOptionsForWorktree } from '../runtime-options'

export function getStatusLineStatsCacheKey(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): string {
  // Why: identical path strings can address different Linux filesystems in
  // different WSL distros, so derived stats must follow Git's execution host.
  return `${options.wslDistro ?? 'native'}\0${worktreePath}`
}
async function runNumstat(
  worktreePath: string,
  cached: boolean,
  options: GitRuntimeOptions = {}
): Promise<Map<string, GitLineStats> | null> {
  try {
    const { stdout } = await gitExecFileAsync(
      [
        '-c',
        'core.quotePath=false',
        'diff',
        '-z',
        ...(cached ? ['--cached'] : []),
        '--numstat',
        '-M'
      ],
      { ...gitOptionsForWorktree(worktreePath, options), env: gitOptionalLocksDisabledEnv() }
    )
    return parseNumstat(stdout)
  } catch (error) {
    // Why: an aborted pass must reject so a cancelled scan is never treated as
    // a completed one; only a genuine (non-abort) numstat failure degrades to
    // uncounted rows below.
    if (options.signal?.aborted) {
      throw error
    }
    // Why: a numstat failure (e.g. transient lock) should leave rows without
    // counts rather than break the whole status refresh. Null (vs an empty
    // map) tells the caller the pass is incomplete and must not be cached.
    return null
  }
}

/** Returns false when a numstat pass failed, so callers skip caching it. */
export async function attachLineStats(
  worktreePath: string,
  entries: GitStatusEntry[],
  options: GitRuntimeOptions = {}
): Promise<boolean> {
  if (entries.length === 0) {
    return true
  }
  const hasStaged = entries.some((entry) => entry.area === 'staged')
  const hasUnstaged = entries.some((entry) => entry.area === 'unstaged')
  const untrackedPaths = entries
    .filter((entry) => entry.area === 'untracked')
    .map((entry) => entry.path)
  const emptyStats = new Map<string, GitLineStats>()
  const [stagedStats, unstagedStats, untrackedStats] = await Promise.all([
    hasStaged ? runNumstat(worktreePath, true, options) : Promise.resolve(emptyStats),
    hasUnstaged ? runNumstat(worktreePath, false, options) : Promise.resolve(emptyStats),
    collectUntrackedAdditions(worktreePath, untrackedPaths, options.signal)
  ])
  for (const entry of entries) {
    applyLineStats(
      entry,
      entry.area === 'staged'
        ? (stagedStats ?? emptyStats).get(entry.path)
        : entry.area === 'unstaged'
          ? (unstagedStats ?? emptyStats).get(entry.path)
          : untrackedStats.get(entry.path)
    )
  }
  return stagedStats !== null && unstagedStats !== null
}
