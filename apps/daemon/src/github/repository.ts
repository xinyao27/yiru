import type { GitPushTarget, GitHubViewer } from '@yiru/runtime-protocol/workbench/types'

import type { HostedReviewExecutionOptions } from '../source-control/hosted-review-git-options'
import { isNotFoundGhError } from './branch-lookup'
import { YIRU_REPO, hostedReviewLocalGitOptionArgs } from './client-foundation'
import {
  execFileAsync,
  ghExecFileAsync,
  acquire,
  release,
  getOwnerRepo,
  getOwnerRepoForRemote,
  resolvePRRepositoryCandidates,
  ghRepoExecOptions,
  githubRepoContext,
  getRemoteUrlForRepo,
  type LocalGitExecOptions,
  type OwnerRepo
} from './github-cli'

export async function checkYiruStarred(): Promise<boolean | null> {
  await acquire()
  try {
    const { stdout, stderr } = await execFileAsync(
      'gh',
      ['api', '--include', `user/starred/${YIRU_REPO}`],
      { encoding: 'utf-8' }
    )
    const response = `${stdout ?? ''}\n${stderr ?? ''}`
    if (/HTTP\/\S+\s+(?:200|204)\b/.test(response)) {
      return true
    }
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // 404 means the user hasn't starred — the only expected "no" answer
    if (message.includes('HTTP 404')) {
      return false
    }
    // Anything else (gh not installed, not authenticated, network issue)
    return null
  } finally {
    release()
  }
}

export function pickPushRemoteUrl(args: {
  originUrl: string | null
  cloneUrl: string
  sshUrl: string
}): string {
  const { originUrl, cloneUrl, sshUrl } = args
  if (originUrl && (/^(git@|ssh:)/.test(originUrl) || originUrl.includes('ssh.github.com'))) {
    return sshUrl
  }
  return cloneUrl
}

export function sanitizeRemoteName(owner: string, repo: string): string {
  const slug = `${owner}-${repo}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  return slug ? `pr-${slug}` : 'pr-head'
}

/**
 * A fork push target plus the PR's `maintainer_can_modify` flag. The flag rides
 * alongside the target (rather than inside {@link GitPushTarget}) so it never
 * leaks into the persisted, validated push-target shape.
 */
export type PullRequestPushTarget = {
  pushTarget: GitPushTarget
  /** false when the PR has "Allow edits from maintainers" off; a push may be rejected. */
  maintainerCanModify?: boolean
}

export async function getPullRequestPushTarget(
  repoPath: string,
  prNumber: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<PullRequestPushTarget | null> {
  const context = githubRepoContext(repoPath, connectionId, localGitOptions)
  const ghOptions = ghRepoExecOptions(context)
  const { candidates } = await resolvePRRepositoryCandidates(
    repoPath,
    connectionId,
    localGitOptions
  )
  if (candidates.length === 0) {
    return null
  }

  await acquire()
  try {
    let prStdout = ''
    for (const candidate of candidates) {
      try {
        const { stdout } = await ghExecFileAsync(
          ['api', `repos/${candidate.owner}/${candidate.repo}/pulls/${prNumber}`],
          {
            ...ghOptions
          }
        )
        prStdout = stdout
        break
      } catch (error) {
        // Why: in fork workflows `origin` is often the contributor fork while
        // the PR number belongs to `upstream`; probe all known PR repos before
        // deciding this PR number is unavailable.
        if (isNotFoundGhError(error)) {
          continue
        }
        throw error
      }
    }
    if (!prStdout) {
      return null
    }
    const origin = await getOwnerRepoForRemote(repoPath, 'origin', connectionId, localGitOptions)
    const pr = JSON.parse(prStdout) as {
      maintainer_can_modify?: boolean
      head?: {
        ref?: string
        repo?: {
          full_name?: string
          clone_url?: string
          ssh_url?: string
          owner?: { login?: string }
          name?: string
        } | null
      }
    }
    const headRepo = pr.head?.repo
    const branchName = pr.head?.ref?.trim()
    const owner = headRepo?.owner?.login?.trim()
    const repo = headRepo?.name?.trim() ?? headRepo?.full_name?.split('/')[1]?.trim()
    const cloneUrl = headRepo?.clone_url?.trim()
    const sshUrl = headRepo?.ssh_url?.trim()
    const maintainerCanModify =
      typeof pr.maintainer_can_modify === 'boolean' ? pr.maintainer_can_modify : undefined
    if (!owner || !repo || !branchName || !cloneUrl || !sshUrl) {
      return null
    }
    if (
      origin &&
      origin.owner.toLowerCase() === owner.toLowerCase() &&
      origin.repo.toLowerCase() === repo.toLowerCase()
    ) {
      return {
        pushTarget: { remoteName: 'origin', branchName },
        ...(maintainerCanModify !== undefined ? { maintainerCanModify } : {})
      }
    }

    let originUrl: string | null = null
    try {
      const rawOriginUrl = await getRemoteUrlForRepo(context, 'origin')
      originUrl = rawOriginUrl?.trim() || null
    } catch {
      originUrl = null
    }
    return {
      pushTarget: {
        remoteName: sanitizeRemoteName(owner, repo),
        branchName,
        remoteUrl: pickPushRemoteUrl({ originUrl, cloneUrl, sshUrl })
      },
      ...(maintainerCanModify !== undefined ? { maintainerCanModify } : {})
    }
  } finally {
    release()
  }
}

/**
 * Star the Yiru repo for the authenticated user.
 */
export async function starYiru(): Promise<boolean> {
  await acquire()
  try {
    await execFileAsync('gh', ['api', '-X', 'PUT', `user/starred/${YIRU_REPO}`], {
      encoding: 'utf-8'
    })
    return true
  } catch {
    return false
  } finally {
    release()
  }
}

/**
 * Get the authenticated GitHub viewer when gh is available and logged in.
 * Returns null when gh is unavailable, unauthenticated, or the lookup fails.
 */
export async function getRepoSlug(
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<OwnerRepo | null> {
  return getOwnerRepo(repoPath, connectionId, ...hostedReviewLocalGitOptionArgs(options))
}

export async function getRepoUpstream(
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<OwnerRepo | null> {
  const localGitArgs = hostedReviewLocalGitOptionArgs(options)
  const localGitOptions = localGitArgs[0] ?? {}
  const origin = await getOwnerRepo(repoPath, connectionId, ...localGitArgs)
  if (!origin) {
    return null
  }

  const upstream = await getOwnerRepoForRemote(repoPath, 'upstream', connectionId, ...localGitArgs)
  if (
    upstream &&
    (upstream.owner.toLowerCase() !== origin.owner.toLowerCase() ||
      upstream.repo.toLowerCase() !== origin.repo.toLowerCase())
  ) {
    return upstream
  }

  await acquire()
  try {
    const { stdout } = await ghExecFileAsync(
      ['repo', 'view', `${origin.owner}/${origin.repo}`, '--json', 'isFork,parent'],
      {
        ...ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions)),
        timeout: 10_000
      }
    )
    const data = JSON.parse(stdout) as {
      isFork?: boolean
      parent?: { name?: string; owner?: { login?: string } } | null
    }
    const owner = data.parent?.owner?.login
    const repo = data.parent?.name
    return data.isFork && owner && repo ? { owner, repo } : null
  } catch {
    return null
  } finally {
    release()
  }
}

export async function getAuthenticatedViewer(): Promise<GitHubViewer | null> {
  await acquire()
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['api', 'user', '--jq', '{login: .login, email: .email}'],
      { encoding: 'utf-8' }
    )
    const viewer = JSON.parse(stdout) as { login?: string; email?: string | null }
    if (!viewer.login?.trim()) {
      return null
    }
    return {
      login: viewer.login.trim(),
      email: viewer.email?.trim() || null
    }
  } catch {
    return null
  } finally {
    release()
  }
}

// Why: main-process maps omit repoId because the IPC handler never receives
// a repo identifier beyond path. Exported because runtime consumers receive
// listWorkItems results before the renderer stamps repoId.
