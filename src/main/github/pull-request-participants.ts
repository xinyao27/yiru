import type { GitHubAssignableUser, GitHubWorkItem, PRComment } from '../../shared/types'
import {
  getOwnerRepo,
  ghExecFileAsync,
  ghRepoExecOptions,
  githubRepoContext,
  type LocalGitExecOptions
} from './gh-utils'
import { noteRateLimitSpend, rateLimitGuard } from './rate-limit'

const PULL_REQUEST_PARTICIPANTS_QUERY = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      participants(first: 100) {
        nodes { login avatarUrl(size: 48) ... on User { name } }
      }
    }
  }
}`

function localGitOptionArgs(options: LocalGitExecOptions = {}): [] | [LocalGitExecOptions] {
  return Object.keys(options).length > 0 ? [options] : []
}

function mergeGitHubUsers(users: GitHubAssignableUser[]): GitHubAssignableUser[] {
  const byLogin = new Map<string, GitHubAssignableUser>()
  for (const user of users) {
    if (!user.login) {
      continue
    }
    const key = user.login.toLowerCase()
    const existing = byLogin.get(key)
    byLogin.set(key, {
      login: existing?.login ?? user.login,
      name: existing?.name ?? user.name ?? null,
      avatarUrl: existing?.avatarUrl || user.avatarUrl || ''
    })
  }
  return Array.from(byLogin.values())
}

export async function getPullRequestParticipants(
  repoPath: string,
  number: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitHubAssignableUser[]> {
  const ownerRepo = await getOwnerRepo(
    repoPath,
    connectionId,
    ...localGitOptionArgs(localGitOptions)
  )
  if (!ownerRepo || rateLimitGuard('graphql').blocked) {
    return []
  }
  try {
    noteRateLimitSpend('graphql')
    const { stdout } = await ghExecFileAsync(
      [
        'api',
        'graphql',
        '-f',
        `query=${PULL_REQUEST_PARTICIPANTS_QUERY}`,
        '-f',
        `owner=${ownerRepo.owner}`,
        '-f',
        `repo=${ownerRepo.repo}`,
        '-F',
        `number=${number}`
      ],
      ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
    )
    const data = JSON.parse(stdout) as {
      data?: {
        repository?: {
          pullRequest?: { participants?: { nodes?: GitHubAssignableUser[] } } | null
        }
      }
    }
    return (data.data?.repository?.pullRequest?.participants?.nodes ?? [])
      .map((user) => ({
        login: user.login,
        name: user.name ?? null,
        avatarUrl: user.avatarUrl ?? ''
      }))
      .filter((user) => user.login)
  } catch {
    return []
  }
}

async function getGitHubUsersByLogin(
  repoPath: string,
  logins: string[],
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitHubAssignableUser[]> {
  const uniqueLogins = Array.from(
    new Set(logins.filter((login) => login && login !== 'ghost').map((login) => login.trim()))
  ).slice(0, 40)
  if (uniqueLogins.length === 0) {
    return []
  }
  if (rateLimitGuard('graphql').blocked) {
    // Why: avatar lookup failures otherwise degrade silently on GitHub Enterprise.
    console.warn(
      `getGitHubUsersByLogin skipped: GraphQL rate-limit budget exhausted (${uniqueLogins.length} logins unresolved)`
    )
    return []
  }
  const fields = uniqueLogins
    .map(
      (login, index) =>
        `u${index}: user(login: ${JSON.stringify(login)}) { login name avatarUrl(size: 48) }`
    )
    .join('\n')
  try {
    noteRateLimitSpend('graphql')
    const { stdout } = await ghExecFileAsync(
      ['api', 'graphql', '-f', `query=query { ${fields} }`],
      ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
    )
    const data = JSON.parse(stdout) as {
      data?: Record<
        string,
        { login?: string; name?: string | null; avatarUrl?: string | null } | null
      >
    }
    return Object.values(data.data ?? {})
      .filter((user): user is { login: string; name?: string | null; avatarUrl?: string | null } =>
        Boolean(user?.login)
      )
      .map((user) => ({
        login: user.login,
        name: user.name ?? null,
        avatarUrl: user.avatarUrl ?? ''
      }))
  } catch {
    return []
  }
}

export function enrichPullRequestDisplayAvatars(
  item: Omit<GitHubWorkItem, 'repoId'>,
  knownUsers: GitHubAssignableUser[]
): Omit<GitHubWorkItem, 'repoId'> {
  const avatarByLogin = new Map<string, string>()
  for (const user of knownUsers) {
    if (user.login && user.avatarUrl) {
      avatarByLogin.set(user.login.toLowerCase(), user.avatarUrl)
    }
  }
  if (avatarByLogin.size === 0) {
    return item
  }
  const avatarFor = (login: string): string | undefined => avatarByLogin.get(login.toLowerCase())
  const resolvedAvatar = (login: string, existing?: string | null): string | undefined =>
    avatarFor(login) || existing || undefined
  const authorAvatarUrl = (item.author ? avatarFor(item.author) : undefined) || item.authorAvatarUrl
  return {
    ...item,
    ...(authorAvatarUrl ? { authorAvatarUrl } : {}),
    ...(item.reviewRequests
      ? {
          reviewRequests: item.reviewRequests.map((user) => ({
            ...user,
            avatarUrl: resolvedAvatar(user.login, user.avatarUrl) ?? ''
          }))
        }
      : {}),
    ...(item.latestReviews
      ? {
          latestReviews: item.latestReviews.map((review) => ({
            ...review,
            avatarUrl: resolvedAvatar(review.login, review.avatarUrl) ?? null
          }))
        }
      : {}),
    ...(item.assignees
      ? {
          assignees: item.assignees.map((user) => ({
            ...user,
            avatarUrl: resolvedAvatar(user.login, user.avatarUrl) ?? ''
          }))
        }
      : {})
  }
}

export async function getPullRequestMentionParticipants(
  repoPath: string,
  item: Pick<GitHubWorkItem, 'author' | 'reviewRequests' | 'latestReviews' | 'assignees'>,
  comments: PRComment[],
  participants: GitHubAssignableUser[],
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitHubAssignableUser[]> {
  // Why: always-visible users come first so the 40-login cap cannot drop reviewer avatars.
  const visibleLogins = [
    item.author ?? '',
    ...(item.reviewRequests ?? []).map((user) => user.login),
    ...(item.latestReviews ?? []).map((review) => review.login),
    ...(item.assignees ?? []).map((user) => user.login),
    ...comments.map((comment) => comment.author)
  ]
  const graphQlUsers = await getGitHubUsersByLogin(
    repoPath,
    visibleLogins,
    connectionId,
    localGitOptions
  )
  return mergeGitHubUsers([...participants, ...graphQlUsers])
}
