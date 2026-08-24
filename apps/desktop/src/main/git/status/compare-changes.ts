import { decodeGitCQuotedPath } from '~shared/git/cquoted-path'
import { parseNumstat } from '~shared/git/uncommitted-line-stats'
import type { GitBranchChangeEntry } from '~shared/types'

import { gitExecFileAsync } from '../runner'
import type { GitRuntimeOptions } from '../runtime-options'
import { gitOptionsForWorktree } from '../runtime-options'
import { parseBranchStatusChar } from './conflict'
import { readGitBlobAtIndexPath, readGitBlobAtOidPath, type GitBlobReadResult } from './diff-result'

const MAX_GIT_SHOW_BYTES = 10 * 1024 * 1024

export async function loadBranchChanges(
  worktreePath: string,
  mergeBase: string,
  headOid: string,
  options: GitRuntimeOptions = {}
): Promise<GitBranchChangeEntry[]> {
  // Why: see core.quotePath=false rationale in getStatus — same reason here so
  // branch-diff entries render with their real UTF-8 paths.
  const gitOptions = {
    ...gitOptionsForWorktree(worktreePath, options),
    maxBuffer: MAX_GIT_SHOW_BYTES
  }
  // Why: both diffs walk the same range and are independent, so start them
  // together instead of serializing two potentially large git operations.
  const [{ stdout }, { stdout: numstat }] = await Promise.all([
    gitExecFileAsync(
      ['-c', 'core.quotePath=false', 'diff', '--name-status', '-M', '-C', mergeBase, headOid],
      gitOptions
    ),
    gitExecFileAsync(
      ['-c', 'core.quotePath=false', 'diff', '-z', '--numstat', '-M', '-C', mergeBase, headOid],
      gitOptions
    )
  ])
  const statsByPath = parseNumstat(numstat)

  const entries: GitBranchChangeEntry[] = []
  // [Fix]: Split by /\r?\n/ instead of '\n' to handle Git CRLF output on Windows,
  // preventing trailing \r characters in extracted file paths.
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) {
      continue
    }
    const entry = parseBranchChangeLine(line)
    if (entry) {
      entries.push({ ...entry, ...statsByPath.get(entry.path) })
    }
  }
  return entries
}

export async function loadCommitChanges(
  worktreePath: string,
  parentOid: string | null,
  commitOid: string,
  options: GitRuntimeOptions = {}
): Promise<GitBranchChangeEntry[]> {
  // Why: root commits have no parent tree; diff-tree --root asks git to
  // compare against the repository's empty tree without hardcoding hash format.
  const args = parentOid
    ? ['-c', 'core.quotePath=false', 'diff', '--name-status', '-M', '-C', parentOid, commitOid]
    : [
        '-c',
        'core.quotePath=false',
        'diff-tree',
        '--root',
        '--no-commit-id',
        '--name-status',
        '-r',
        '-M',
        '-C',
        commitOid
      ]
  const numstatArgs = parentOid
    ? ['-c', 'core.quotePath=false', 'diff', '-z', '--numstat', '-M', '-C', parentOid, commitOid]
    : [
        '-c',
        'core.quotePath=false',
        'diff-tree',
        '-z',
        '--root',
        '--no-commit-id',
        '--numstat',
        '-r',
        '-M',
        '-C',
        commitOid
      ]
  const gitOptions = {
    ...gitOptionsForWorktree(worktreePath, options),
    maxBuffer: MAX_GIT_SHOW_BYTES
  }
  // Why: commit diff rows need metadata and line counts, but those git queries
  // do not depend on each other.
  const [{ stdout }, { stdout: numstat }] = await Promise.all([
    gitExecFileAsync(args, gitOptions),
    gitExecFileAsync(numstatArgs, gitOptions)
  ])
  const statsByPath = parseNumstat(numstat)

  const entries: GitBranchChangeEntry[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) {
      continue
    }
    const entry = parseBranchChangeLine(line)
    if (entry) {
      entries.push({ ...entry, ...statsByPath.get(entry.path) })
    }
  }
  return entries
}

export function parseBranchChangeLine(line: string): GitBranchChangeEntry | null {
  const parts = line.split('\t')
  const rawStatus = parts[0] ?? ''
  const status = parseBranchStatusChar(rawStatus[0] ?? 'M')

  if (rawStatus.startsWith('R') || rawStatus.startsWith('C')) {
    const oldPath = decodeGitCQuotedPath(parts[1] ?? '')
    const path = decodeGitCQuotedPath(parts[2] ?? '')
    if (!path) {
      return null
    }
    return { path, oldPath, status }
  }

  const path = decodeGitCQuotedPath(parts[1] ?? '')
  if (!path) {
    return null
  }

  return { path, status }
}

export async function resolveCompareRef(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<string> {
  try {
    const { stdout } = await gitExecFileAsync(['branch', '--show-current'], {
      ...gitOptionsForWorktree(worktreePath, options)
    })
    const branch = stdout.trim()
    return branch || 'HEAD'
  } catch {
    return 'HEAD'
  }
}

export async function resolveRefOid(
  worktreePath: string,
  ref: string,
  options: GitRuntimeOptions = {}
): Promise<string> {
  const { stdout } = await gitExecFileAsync(['rev-parse', '--verify', '--end-of-options', ref], {
    ...gitOptionsForWorktree(worktreePath, options)
  })
  return stdout.trim()
}

export async function resolveMergeBase(
  worktreePath: string,
  baseOid: string,
  headOid: string,
  options: GitRuntimeOptions = {}
): Promise<string> {
  const { stdout } = await gitExecFileAsync(['merge-base', baseOid, headOid], {
    ...gitOptionsForWorktree(worktreePath, options)
  })
  return stdout.trim()
}

export async function countAheadCommits(
  worktreePath: string,
  baseOid: string,
  headOid: string,
  options: GitRuntimeOptions = {}
): Promise<number> {
  const { stdout } = await gitExecFileAsync(['rev-list', '--count', `${baseOid}..${headOid}`], {
    ...gitOptionsForWorktree(worktreePath, options)
  })
  return Number.parseInt(stdout.trim(), 10) || 0
}

export async function readUnstagedLeftBlob(
  worktreePath: string,
  filePath: string,
  options: GitRuntimeOptions = {}
): Promise<GitBlobReadResult> {
  const indexBlob = await readGitBlobAtIndexPath(worktreePath, filePath, options)
  if (indexBlob.exists) {
    return indexBlob
  }

  return readGitBlobAtOidPath(worktreePath, 'HEAD', filePath, options)
}
