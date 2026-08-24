import type { GitHubPullRequestStateUpdate } from '~shared/types'

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

export async function updatePRState(
  repoPath: string,
  prNumber: number,
  updates: GitHubPullRequestStateUpdate,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const context = githubRepoContext(repoPath, connectionId, localGitOptions)
  const ghOptions = ghRepoExecOptions(context)
  const ownerRepo = await getOwnerRepo(repoPath, connectionId, localGitOptions)
  if (!ownerRepo) {
    return { ok: false, error: 'Could not resolve GitHub owner/repo for this repository' }
  }

  await acquire()
  try {
    const cmd = updates.state === 'closed' ? 'close' : 'reopen'
    // Why: GitHub can reject REST pull state PATCHes for reopen paths with a
    // generic 422; gh's PR commands use GitHub's supported reopen flow.
    await ghExecFileAsync(
      ['pr', cmd, String(prNumber), '--repo', `${ownerRepo.owner}/${ownerRepo.repo}`],
      {
        ...ghOptions
      }
    )
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
    return { ok: false, error: classifyGhError(message).message }
  } finally {
    release()
  }
}

export async function requestPRReviewers(
  repoPath: string,
  prNumber: number,
  reviewers: string[],
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const logins = reviewers.map((reviewer) => reviewer.trim()).filter(Boolean)
  if (logins.length === 0) {
    return { ok: false, error: 'Enter at least one reviewer' }
  }
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = await getOwnerRepo(repoPath, connectionId, localGitOptions)
  await acquire()
  try {
    const args = ['pr', 'edit', String(prNumber), '--add-reviewer', logins.join(',')]
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

export async function removePRReviewers(
  repoPath: string,
  prNumber: number,
  reviewers: string[],
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const logins = reviewers.map((reviewer) => reviewer.trim()).filter(Boolean)
  if (logins.length === 0) {
    return { ok: false, error: 'Enter at least one reviewer' }
  }
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = await getOwnerRepo(repoPath, connectionId, localGitOptions)
  await acquire()
  try {
    const args = ['pr', 'edit', String(prNumber), '--remove-reviewer', logins.join(',')]
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

/**
 * Update a PR's title.
 */
export async function updatePRTitle(
  repoPath: string,
  prNumber: number,
  title: string,
  connectionId?: string | null,
  prRepo?: OwnerRepo | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<boolean> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = prRepo ?? (await getOwnerRepo(repoPath, connectionId, localGitOptions))
  await acquire()
  try {
    const args = ['pr', 'edit', String(prNumber), '--title', title]
    if (ownerRepo) {
      args.push('--repo', `${ownerRepo.owner}/${ownerRepo.repo}`)
    }
    await ghExecFileAsync(args, {
      ...ghOptions
    })
    return true
  } catch (err) {
    console.warn('updatePRTitle failed:', err)
    return false
  } finally {
    release()
  }
}

export async function updatePRDetails(
  repoPath: string,
  prNumber: number,
  updates: { title?: string; body?: string },
  connectionId?: string | null,
  prRepo?: OwnerRepo | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = prRepo ?? (await getOwnerRepo(repoPath, connectionId, localGitOptions))
  if (!ownerRepo) {
    return { ok: false, error: 'Could not resolve GitHub owner/repo for this repository' }
  }

  const fields: string[] = []
  if (updates.title !== undefined) {
    const title = updates.title.trim()
    if (!title) {
      return { ok: false, error: 'Title is required' }
    }
    fields.push(`title=${title}`)
  }
  if (updates.body !== undefined) {
    fields.push(`body=${updates.body}`)
  }
  if (fields.length === 0) {
    return { ok: true }
  }

  await acquire()
  try {
    await ghExecFileAsync(
      [
        'api',
        '-X',
        'PATCH',
        `repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${prNumber}`,
        ...fields.flatMap((field) => ['--raw-field', field])
      ],
      ghOptions
    )
    return { ok: true }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
    return { ok: false, error: classifyGhError(message).message }
  } finally {
    release()
  }
}
