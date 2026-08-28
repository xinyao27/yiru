import type { GitHubPRMergeMethod } from '@yiru/runtime-protocol/workbench/types'

import { enablePRAutoMerge, getPRMergeBlocker } from './auto-merge'
import {
  ghExecFileAsync,
  acquire,
  release,
  getOwnerRepo,
  classifyGhError,
  ghRepoExecOptions,
  githubRepoContext,
  type LocalGitExecOptions,
  type OwnerRepo
} from './github-cli'

export async function mergePR(
  repoPath: string,
  prNumber: number,
  method: 'merge' | 'squash' | 'rebase' = 'squash',
  connectionId?: string | null,
  prRepo?: OwnerRepo | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = prRepo ?? (await getOwnerRepo(repoPath, connectionId, localGitOptions))
  await acquire()
  try {
    const mergeBlocker = await getPRMergeBlocker(
      repoPath,
      prNumber,
      ownerRepo,
      ghOptions,
      connectionId,
      localGitOptions
    )
    if (mergeBlocker) {
      return { ok: false, error: mergeBlocker }
    }

    // Don't use --delete-branch: it tries to delete the local branch which
    // fails when the user's worktree is checked out on it. Branch cleanup
    // is handled by worktree deletion (local) and GitHub's auto-delete setting (remote).
    const args = ['pr', 'merge', String(prNumber), `--${method}`]
    if (ownerRepo) {
      args.push('--repo', `${ownerRepo.owner}/${ownerRepo.repo}`)
    }
    await ghExecFileAsync(args, {
      ...ghOptions,
      env: { ...process.env, GH_PROMPT_DISABLED: '1' }
    })
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
    return { ok: false, error: message }
  } finally {
    release()
  }
}

export async function setPRAutoMerge(
  repoPath: string,
  prNumber: number,
  enabled: boolean,
  method: GitHubPRMergeMethod = 'squash',
  connectionId?: string | null,
  prRepo?: OwnerRepo | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = prRepo ?? (await getOwnerRepo(repoPath, connectionId, localGitOptions))
  await acquire()
  try {
    if (enabled) {
      return await enablePRAutoMerge(prNumber, method, ownerRepo, ghOptions)
    }
    const args = ['pr', 'merge', String(prNumber), '--disable-auto']
    if (ownerRepo) {
      args.push('--repo', `${ownerRepo.owner}/${ownerRepo.repo}`)
    }
    await ghExecFileAsync(args, {
      ...ghOptions,
      env: { ...process.env, GH_PROMPT_DISABLED: '1' }
    })
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
    return { ok: false, error: classifySetAutoMergeError(message) }
  } finally {
    release()
  }
}

// Why: GitHub rejects enabling auto-merge on a PR that can already merge with
// "Pull request is in clean status". Surface the actionable next step (merge
// directly) instead of the raw GraphQL error.
export function classifySetAutoMergeError(message: string): string {
  if (/in clean status/i.test(message)) {
    return 'This pull request can already be merged. Use Merge instead of auto-merge.'
  }
  return classifyGhError(message).message
}
