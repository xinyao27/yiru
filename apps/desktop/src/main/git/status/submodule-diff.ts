import * as path from 'node:path'

import { parseNumstat } from '~shared/git/uncommitted-line-stats'
import type { GitDiffResult, GitStatusEntry, GitStatusResult } from '~shared/types'

import { gitExecFileAsync, gitOptionalLocksDisabledEnv } from '../runner'
import type { GitRuntimeOptions } from '../runtime-options'
import { gitOptionsForWorktree } from '../runtime-options'
import { parseBranchChangeLine } from './compare-changes'
import { buildDiffResult, readGitBlobAtOidPath } from './diff-result'
import { getStatus } from './read'

export function resolveSubmoduleWorktreePath(worktreePath: string, submodulePath: string): string {
  if (!submodulePath || submodulePath.includes('\0') || path.isAbsolute(submodulePath)) {
    throw new Error('Access denied: invalid submodule path')
  }
  const resolved = path.resolve(worktreePath, submodulePath)
  const rel = path.relative(worktreePath, resolved)
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error('Access denied: submodule path escapes the selected worktree')
  }
  return resolved
}

/**
 * Run a plain status inside a submodule's own worktree. Used by the lazy
 * "expand submodule" flow — the parent status only reports a single gitlink
 * row, so the inner per-file changes are fetched on demand here. Entry paths
 * are relative to the submodule root; the renderer prefixes them with the
 * submodule path.
 */
export async function getSubmoduleStatus(
  worktreePath: string,
  submodulePath: string,
  options: GitRuntimeOptions & { staged?: boolean } = {}
): Promise<GitStatusResult> {
  const submoduleWorktreePath = resolveSubmoduleWorktreePath(worktreePath, submodulePath)
  const workingResult = await getStatus(submoduleWorktreePath, options)
  // Why: a moved gitlink (clean worktree) has no uncommitted status rows; its
  // real changes live between the parent-recorded commit and the checked-out
  // commit. Surface those as inner rows so the expansion isn't empty.
  const fromOid = options.staged
    ? await readGitlinkOidFromTree(worktreePath, 'HEAD', submodulePath, options)
    : (await readGitlinkOidFromIndex(worktreePath, submodulePath, options)) ||
      (await readGitlinkOidFromTree(worktreePath, 'HEAD', submodulePath, options))
  const toOid = options.staged
    ? await readGitlinkOidFromIndex(worktreePath, submodulePath, options)
    : await readWorkingSubmoduleHead(submoduleWorktreePath, options)
  if (fromOid && toOid && fromOid !== toOid) {
    const rangeEntries = await computeSubmoduleRangeEntries(
      submoduleWorktreePath,
      fromOid,
      toOid,
      options
    )
    if (options.staged) {
      return { ...workingResult, entries: rangeEntries }
    }
    const rangePaths = new Set(rangeEntries.map((entry) => entry.path))
    // Range rows win on overlap so the diff matches getDiff's commit-range route.
    const entries = [
      ...rangeEntries,
      ...workingResult.entries.filter((entry) => !rangePaths.has(entry.path))
    ]
    return { ...workingResult, entries }
  }
  if (options.staged) {
    return { ...workingResult, entries: [] }
  }
  return workingResult
}

/**
 * List files changed between two submodule commits as status rows. Used when a
 * gitlink pointer moved so the expanded submodule shows the committed file
 * changes (each row diffs the file across the two commits).
 */
async function computeSubmoduleRangeEntries(
  submoduleWorktreePath: string,
  fromOid: string,
  toOid: string,
  options: GitRuntimeOptions = {}
): Promise<GitStatusEntry[]> {
  const gitOptions = {
    ...gitOptionsForWorktree(submoduleWorktreePath, options),
    env: gitOptionalLocksDisabledEnv()
  }
  let nameStatus = ''
  let numstat = ''
  try {
    const [statusResult, numstatResult] = await Promise.all([
      gitExecFileAsync(
        ['-c', 'core.quotePath=false', 'diff', '--name-status', '-M', '-C', fromOid, toOid],
        gitOptions
      ),
      gitExecFileAsync(
        ['-c', 'core.quotePath=false', 'diff', '-z', '--numstat', '-M', '-C', fromOid, toOid],
        gitOptions
      )
    ])
    nameStatus = statusResult.stdout
    numstat = numstatResult.stdout
  } catch {
    return []
  }
  const statsByPath = parseNumstat(numstat)
  const entries: GitStatusEntry[] = []
  for (const line of nameStatus.split(/\r?\n/)) {
    if (!line) {
      continue
    }
    const change = parseBranchChangeLine(line)
    if (!change) {
      continue
    }
    entries.push({
      path: change.path,
      status: change.status,
      area: 'unstaged',
      ...(change.oldPath ? { oldPath: change.oldPath } : {}),
      ...statsByPath.get(change.path)
    })
  }
  return entries
}
export async function readGitlinkOidFromTree(
  worktreePath: string,
  ref: string,
  submodulePath: string,
  options: GitRuntimeOptions
): Promise<string> {
  try {
    const { stdout } = await gitExecFileAsync(['ls-tree', ref, '--', submodulePath], {
      ...gitOptionsForWorktree(worktreePath, options),
      env: gitOptionalLocksDisabledEnv()
    })
    return stdout.match(/^160000 commit ([0-9a-f]+)\t/m)?.[1] ?? ''
  } catch {
    return ''
  }
}

export async function readGitlinkOidFromIndex(
  worktreePath: string,
  submodulePath: string,
  options: GitRuntimeOptions
): Promise<string> {
  try {
    const { stdout } = await gitExecFileAsync(['ls-files', '-s', '--', submodulePath], {
      ...gitOptionsForWorktree(worktreePath, options),
      env: gitOptionalLocksDisabledEnv()
    })
    return stdout.match(/^160000 ([0-9a-f]+) /m)?.[1] ?? ''
  } catch {
    return ''
  }
}

export async function readWorkingSubmoduleHead(
  submoduleWorktreePath: string,
  options: GitRuntimeOptions
): Promise<string> {
  try {
    const { stdout } = await gitExecFileAsync(['rev-parse', 'HEAD'], {
      ...gitOptionsForWorktree(submoduleWorktreePath, options),
      env: gitOptionalLocksDisabledEnv()
    })
    return stdout.trim()
  } catch {
    return ''
  }
}

/**
 * Synthesize a gitlink pointer diff. Git represents submodule commit changes as
 * a one-line `Subproject commit <oid>` swap, so feeding the old/new oids through
 * the normal text differ matches git's own rendering.
 */
export async function buildSubmodulePointerDiff(
  worktreePath: string,
  submodulePath: string,
  staged: boolean,
  compareAgainstHead: boolean,
  options: GitRuntimeOptions,
  // Why: default to the validated resolver so every caller (not just loadDiff)
  // is protected from a .gitmodules path escaping the parent worktree.
  submoduleWorktreePath = resolveSubmoduleWorktreePath(worktreePath, submodulePath)
): Promise<GitDiffResult> {
  let leftOid = ''
  let rightOid = ''
  if (staged) {
    leftOid = await readGitlinkOidFromTree(worktreePath, 'HEAD', submodulePath, options)
    rightOid = await readGitlinkOidFromIndex(worktreePath, submodulePath, options)
  } else if (compareAgainstHead) {
    leftOid = await readGitlinkOidFromTree(worktreePath, 'HEAD', submodulePath, options)
    rightOid = await readWorkingSubmoduleHead(submoduleWorktreePath, options)
  } else {
    leftOid =
      (await readGitlinkOidFromIndex(worktreePath, submodulePath, options)) ||
      (await readGitlinkOidFromTree(worktreePath, 'HEAD', submodulePath, options))
    rightOid = await readWorkingSubmoduleHead(submoduleWorktreePath, options)
  }
  return buildDiffResult(
    leftOid ? `Subproject commit ${leftOid}\n` : '',
    rightOid ? `Subproject commit ${rightOid}\n` : '',
    false,
    false,
    submodulePath
  )
}

/**
 * Diff a file inside a submodule across two of its commits. Used when the parent
 * gitlink moved but the submodule worktree is clean — the change is committed,
 * so compare the recorded commit's blob against the checked-out commit's blob.
 */
export async function buildSubmoduleInnerCommitRangeDiff(
  submoduleWorktreePath: string,
  innerPath: string,
  fromOid: string,
  toOid: string,
  options: GitRuntimeOptions
): Promise<GitDiffResult> {
  let originalContent = ''
  let modifiedContent = ''
  let originalIsBinary = false
  let modifiedIsBinary = false
  try {
    const left = await readGitBlobAtOidPath(submoduleWorktreePath, fromOid, innerPath, options)
    originalContent = left.content
    originalIsBinary = left.isBinary
    const right = await readGitBlobAtOidPath(submoduleWorktreePath, toOid, innerPath, options)
    modifiedContent = right.content
    modifiedIsBinary = right.isBinary
  } catch {
    // Fallback to empty content; a missing blob (add/delete) reads as one side.
  }
  return buildDiffResult(
    originalContent,
    modifiedContent,
    originalIsBinary,
    modifiedIsBinary,
    innerPath
  )
}

/**
 * Get original and modified content for diffing a file.
 */
