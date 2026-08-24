import * as path from 'node:path'

import { stableInFlightKey } from '~shared/in-flight-promise-dedupe'
import type { GitDiffResult } from '~shared/types'

import type { GitRuntimeOptions } from '../runtime-options'
import { gitDiffReadDedupe } from './cache'
import { readUnstagedLeftBlob } from './compare-changes'
import {
  buildDiffResult,
  readGitBlobAtIndexPath,
  readGitBlobAtOidPath,
  readWorkingTreeFile
} from './diff-result'
import { gitRuntimeOptionsKey } from './runtime-key'
import {
  buildSubmoduleInnerCommitRangeDiff,
  buildSubmodulePointerDiff,
  readGitlinkOidFromIndex,
  readGitlinkOidFromTree,
  readWorkingSubmoduleHead,
  resolveSubmoduleWorktreePath
} from './submodule-diff'
import { findContainingSubmodule, listSubmodulePaths } from './submodule-paths'

export async function getDiff(
  worktreePath: string,
  filePath: string,
  staged: boolean,
  compareAgainstHead = false,
  options: GitRuntimeOptions = {}
): Promise<GitDiffResult> {
  // Why: register the in-flight dedupe synchronously (before any await) so
  // concurrent identical reads coalesce; submodule routing happens inside.
  return gitDiffReadDedupe.run(
    stableInFlightKey([
      'diff',
      worktreePath,
      filePath,
      staged,
      compareAgainstHead,
      ...gitRuntimeOptionsKey(options)
    ]),
    () => loadDiff(worktreePath, filePath, staged, compareAgainstHead, options)
  )
}

async function loadDiff(
  worktreePath: string,
  filePath: string,
  staged: boolean,
  compareAgainstHead: boolean,
  options: GitRuntimeOptions
): Promise<GitDiffResult> {
  // Why: gitlink paths can't be read as blobs (`git show HEAD:<sub>` is a "bad
  // object") and a submodule working dir reads as empty, so route submodule
  // diffs explicitly: the gitlink root → pointer diff, inner files → recurse
  // into the submodule's own worktree.
  const submodulePaths = await listSubmodulePaths(worktreePath, options)
  if (submodulePaths.length > 0) {
    const matchedSubmodule = findContainingSubmodule(submodulePaths, filePath)
    if (matchedSubmodule) {
      // Why: matchedSubmodule originates from .gitmodules, so validate it against
      // the worktree boundary before any inner read — a crafted submodule path
      // must not let the diff escape the selected repo.
      const submoduleWorktreePath = resolveSubmoduleWorktreePath(worktreePath, matchedSubmodule)
      const normalizedFilePath = filePath.replace(/\\/g, '/').replace(/\/+$/, '')
      if (normalizedFilePath === matchedSubmodule) {
        return buildSubmodulePointerDiff(
          worktreePath,
          matchedSubmodule,
          staged,
          compareAgainstHead,
          options,
          submoduleWorktreePath
        )
      }
      const innerPath = normalizedFilePath.slice(matchedSubmodule.length + 1)
      const fromOid = staged
        ? await readGitlinkOidFromTree(worktreePath, 'HEAD', matchedSubmodule, options)
        : (await readGitlinkOidFromIndex(worktreePath, matchedSubmodule, options)) ||
          (await readGitlinkOidFromTree(worktreePath, 'HEAD', matchedSubmodule, options))
      const toOid = staged
        ? await readGitlinkOidFromIndex(worktreePath, matchedSubmodule, options)
        : await readWorkingSubmoduleHead(submoduleWorktreePath, options)
      // Why: when the gitlink moved but the submodule worktree is clean, the
      // file's change lives in committed history — diff the two commits. Only
      // fall back to the working-tree blob read when the commit didn't move.
      if (fromOid && toOid && fromOid !== toOid) {
        return buildSubmoduleInnerCommitRangeDiff(
          submoduleWorktreePath,
          innerPath,
          fromOid,
          toOid,
          options
        )
      }
      return getDiff(submoduleWorktreePath, innerPath, staged, compareAgainstHead, options)
    }
  }

  let originalContent = ''
  let modifiedContent = ''
  let originalIsBinary = false
  let modifiedIsBinary = false
  let modifiedDeleted = false

  try {
    const leftBlob = staged
      ? await readGitBlobAtOidPath(worktreePath, 'HEAD', filePath, options)
      : compareAgainstHead
        ? await readGitBlobAtOidPath(worktreePath, 'HEAD', filePath, options)
        : await readUnstagedLeftBlob(worktreePath, filePath, options)
    originalContent = leftBlob.content
    originalIsBinary = leftBlob.isBinary

    if (staged) {
      const rightBlob = await readGitBlobAtIndexPath(worktreePath, filePath, options)
      modifiedContent = rightBlob.content
      modifiedIsBinary = rightBlob.isBinary
      modifiedDeleted = !rightBlob.exists
    } else {
      const workingTreeBlob = await readWorkingTreeFile(path.join(worktreePath, filePath))
      modifiedContent = workingTreeBlob.content
      modifiedIsBinary = workingTreeBlob.isBinary
      modifiedDeleted = !workingTreeBlob.exists
    }
  } catch {
    // Fallback
  }

  const result = buildDiffResult(
    originalContent,
    modifiedContent,
    originalIsBinary,
    modifiedIsBinary,
    filePath
  )
  // Why: mark a proven deletion so previewers can fall back to the original bytes
  // without mistaking a read failure's empty modified side for a deletion.
  if (result.kind === 'binary' && modifiedDeleted) {
    return { ...result, modifiedDeleted: true }
  }
  return result
}
