import type { GitHubAssignableUser, GitHubCommentResult, PRComment } from '../../shared/types'
import {
  acquire,
  classifyGhError,
  getOwnerRepo,
  ghExecFileAsync,
  ghRepoExecOptions,
  githubRepoContext,
  release,
  type LocalGitExecOptions,
  type OwnerRepo
} from './gh-utils'

export async function addPullRequestComment(
  repoPath: string,
  pullRequestNumber: number,
  body: string,
  connectionId?: string | null,
  ownerRepoOverride?: OwnerRepo | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitHubCommentResult> {
  const context = githubRepoContext(repoPath, connectionId, localGitOptions)
  const ghOptions = ghRepoExecOptions(context)
  const ownerRepo =
    ownerRepoOverride ?? (await getOwnerRepo(repoPath, connectionId, localGitOptions))
  if (!ownerRepo) {
    return { ok: false, error: 'Could not resolve GitHub owner/repo for this repository' }
  }
  await acquire()
  try {
    // Why: GitHub models pull-request conversation comments through its issues endpoint.
    const { stdout } = await ghExecFileAsync(
      [
        'api',
        '-X',
        'POST',
        `repos/${ownerRepo.owner}/${ownerRepo.repo}/issues/${pullRequestNumber}/comments`,
        '--raw-field',
        `body=${body}`
      ],
      ghOptions
    )
    const data = JSON.parse(stdout) as {
      id?: number
      user: { login: string; avatar_url: string; type?: string } | null
      body?: string
      created_at?: string
      html_url?: string
    }
    if (typeof data.id !== 'number' || !Number.isSafeInteger(data.id) || data.id < 1) {
      return { ok: false, error: 'Unexpected response from GitHub' }
    }
    const comment: PRComment = {
      id: data.id,
      author: data.user?.login ?? 'You',
      authorAvatarUrl: data.user?.avatar_url ?? '',
      body: data.body ?? body,
      createdAt: data.created_at ?? new Date().toISOString(),
      url: data.html_url ?? '',
      isBot: data.user?.type === 'Bot'
    }
    return { ok: true, comment }
  } catch (error) {
    const stderr = error instanceof Error ? error.message : String(error)
    return { ok: false, error: classifyGhError(stderr).message }
  } finally {
    release()
  }
}

export async function listPullRequestLabels(
  repoPath: string,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<string[]> {
  const ownerRepo = await getOwnerRepo(repoPath, connectionId, localGitOptions)
  if (!ownerRepo) {
    return []
  }
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  await acquire()
  try {
    const { stdout } = await ghExecFileAsync(
      [
        'api',
        '--paginate',
        `repos/${ownerRepo.owner}/${ownerRepo.repo}/labels`,
        '--jq',
        '.[].name'
      ],
      ghOptions
    )
    return stdout
      .trim()
      .split('\n')
      .filter((label) => label.length > 0)
  } catch {
    return []
  } finally {
    release()
  }
}

export async function listPullRequestAssignableUsers(
  repoPath: string,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitHubAssignableUser[]> {
  const ownerRepo = await getOwnerRepo(repoPath, connectionId, localGitOptions)
  if (!ownerRepo) {
    return []
  }
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  await acquire()
  try {
    const { stdout } = await ghExecFileAsync(
      [
        'api',
        '--paginate',
        `repos/${ownerRepo.owner}/${ownerRepo.repo}/assignees?per_page=100`,
        '--jq',
        '.[] | {login, avatar_url}'
      ],
      ghOptions
    )
    const users: GitHubAssignableUser[] = []
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }
      try {
        const user = JSON.parse(trimmed) as { login?: string; avatar_url?: string | null }
        if (user.login) {
          users.push({ login: user.login, name: null, avatarUrl: user.avatar_url ?? '' })
        }
      } catch {
        // Skip malformed NDJSON lines defensively.
      }
    }
    return users
  } catch {
    return []
  } finally {
    release()
  }
}
