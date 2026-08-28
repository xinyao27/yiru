import { parseGitRevListFirstParentOid } from '@yiru/runtime-protocol/workbench/git/rev-list-output'
import type { GitCommitCompareResult, GitDiffResult } from '@yiru/runtime-protocol/workbench/types'
import { stableInFlightKey } from '~main/in-flight-promise-dedupe'

import { gitExecFileAsync } from '../runner/runner'
import type { GitRuntimeOptions } from '../runner/runtime-options'
import { gitOptionsForWorktree } from '../runner/runtime-options'
import { gitDiffReadDedupe } from './cache'
import { loadCommitChanges, resolveRefOid } from './compare-changes'
import { buildDiffResult, readGitBlobAtOidPath } from './diff-result'
import { gitRuntimeOptionsKey } from './runtime-key'

export async function getCommitCompare(
  worktreePath: string,
  commitId: string,
  options: GitRuntimeOptions = {}
): Promise<GitCommitCompareResult> {
  let commitOid = ''
  try {
    commitOid = await resolveRefOid(worktreePath, `${commitId}^{commit}`, options)
  } catch {
    return {
      summary: {
        commitOid: '',
        parentOid: null,
        compareRef: commitId,
        baseRef: 'parent',
        changedFiles: 0,
        status: 'invalid-commit',
        errorMessage: `Commit ${commitId} could not be resolved in this repository.`
      },
      entries: []
    }
  }

  const summary = {
    commitOid,
    parentOid: null as string | null,
    compareRef: commitOid.slice(0, 7),
    baseRef: 'empty tree',
    changedFiles: 0,
    status: 'ready' as const
  }

  try {
    const { stdout } = await gitExecFileAsync(
      ['rev-list', '--parents', '-n', '1', commitOid],
      gitOptionsForWorktree(worktreePath, options)
    )
    const firstParent = parseGitRevListFirstParentOid(stdout)
    summary.parentOid = firstParent
    summary.baseRef = firstParent ? firstParent.slice(0, 7) : 'empty tree'

    const entries = await loadCommitChanges(worktreePath, summary.parentOid, commitOid, options)
    summary.changedFiles = entries.length
    return { summary, entries }
  } catch (error) {
    return {
      summary: {
        ...summary,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Failed to load commit diff'
      },
      entries: []
    }
  }
}

export async function getCommitDiff(
  worktreePath: string,
  args: {
    commitOid: string
    parentOid?: string | null
    filePath: string
    oldPath?: string
  },
  options: GitRuntimeOptions = {}
): Promise<GitDiffResult> {
  return gitDiffReadDedupe.run(
    stableInFlightKey([
      'commitDiff',
      worktreePath,
      args.commitOid,
      args.parentOid ?? null,
      args.filePath,
      args.oldPath ?? null,
      ...gitRuntimeOptionsKey(options)
    ]),
    () => loadCommitDiff(worktreePath, args, options)
  )
}

async function loadCommitDiff(
  worktreePath: string,
  args: {
    commitOid: string
    parentOid?: string | null
    filePath: string
    oldPath?: string
  },
  options: GitRuntimeOptions
): Promise<GitDiffResult> {
  try {
    const leftPath = args.oldPath ?? args.filePath
    const leftBlob = args.parentOid
      ? await readGitBlobAtOidPath(worktreePath, args.parentOid, leftPath, options)
      : { content: '', isBinary: false }
    const rightBlob = await readGitBlobAtOidPath(
      worktreePath,
      args.commitOid,
      args.filePath,
      options
    )

    return buildDiffResult(
      leftBlob.content,
      rightBlob.content,
      leftBlob.isBinary,
      rightBlob.isBinary,
      args.filePath
    )
  } catch {
    return {
      kind: 'text',
      originalContent: '',
      modifiedContent: '',
      originalIsBinary: false,
      modifiedIsBinary: false
    }
  }
}
