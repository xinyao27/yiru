import type { GitHubPRFile, GitHubPRFileViewedState } from '../../shared/types'
import {
  getOwnerRepo,
  ghExecFileAsync,
  ghRepoExecOptions,
  githubRepoContext,
  type LocalGitExecOptions
} from './gh-utils'
import { getPRReviewCommentLineNumbersFromPatch } from './pr-review-comment-lines'
import { noteRateLimitSpend, rateLimitGuard } from './rate-limit'

const MAX_PR_FILES = 300

const PR_FILE_VIEWED_STATES_QUERY = `query($owner: String!, $repo: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      files(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { path viewerViewedState }
      }
    }
  }
}`

function localGitOptionArgs(options: LocalGitExecOptions = {}): [] | [LocalGitExecOptions] {
  return Object.keys(options).length > 0 ? [options] : []
}

type RESTPRFile = {
  filename: string
  previous_filename?: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

function mapFileStatus(raw: string): GitHubPRFile['status'] {
  switch (raw) {
    case 'added':
    case 'removed':
    case 'modified':
    case 'renamed':
    case 'copied':
    case 'changed':
    case 'unchanged':
      return raw
    default:
      return 'modified'
  }
}

export type PRFileViewedStatesResult = {
  pullRequestId: string
  viewedStates: Map<string, GitHubPRFileViewedState>
}

export async function getPullRequestHeadBaseSha(
  repoPath: string,
  prNumber: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ headSha: string; baseSha: string } | null> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = await getOwnerRepo(
    repoPath,
    connectionId,
    ...localGitOptionArgs(localGitOptions)
  )
  try {
    if (ownerRepo) {
      const { stdout } = await ghExecFileAsync(
        ['api', '--cache', '60s', `repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${prNumber}`],
        ghOptions
      )
      const data = JSON.parse(stdout) as {
        head?: { sha?: string }
        base?: { sha?: string }
      }
      return data.head?.sha && data.base?.sha
        ? { headSha: data.head.sha, baseSha: data.base.sha }
        : null
    }
    const { stdout } = await ghExecFileAsync(
      ['pr', 'view', String(prNumber), '--json', 'headRefOid,baseRefOid'],
      ghOptions
    )
    const data = JSON.parse(stdout) as { headRefOid?: string; baseRefOid?: string }
    return data.headRefOid && data.baseRefOid
      ? { headSha: data.headRefOid, baseSha: data.baseRefOid }
      : null
  } catch {
    return null
  }
}

// Why: null distinguishes a blocked fetch from a genuinely empty pull request.
export async function getPullRequestFiles(
  repoPath: string,
  prNumber: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitHubPRFile[] | null> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = await getOwnerRepo(
    repoPath,
    connectionId,
    ...localGitOptionArgs(localGitOptions)
  )
  if (!ownerRepo) {
    return null
  }
  try {
    const { stdout } = await ghExecFileAsync(
      [
        'api',
        '--cache',
        '60s',
        `repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${prNumber}/files?per_page=100`
      ],
      ghOptions
    )
    const data = JSON.parse(stdout) as RESTPRFile[]
    return data.slice(0, MAX_PR_FILES).map((file) => ({
      path: file.filename,
      oldPath: file.previous_filename,
      status: mapFileStatus(file.status),
      additions: file.additions,
      deletions: file.deletions,
      // GitHub omits patch text for binary and oversized diffs.
      isBinary: file.patch === undefined && file.changes > 0,
      reviewCommentLineNumbers: getPRReviewCommentLineNumbersFromPatch(file.patch)
    }))
  } catch {
    return null
  }
}

export async function getPullRequestFileViewedStates(
  repoPath: string,
  prNumber: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<PRFileViewedStatesResult | null> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = await getOwnerRepo(
    repoPath,
    connectionId,
    ...localGitOptionArgs(localGitOptions)
  )
  if (!ownerRepo || rateLimitGuard('graphql').blocked) {
    return null
  }
  const viewedStates = new Map<string, GitHubPRFileViewedState>()
  let pullRequestId: string | null = null
  let after: string | null = null

  try {
    for (let fetched = 0; fetched < MAX_PR_FILES; fetched += 100) {
      const args = [
        'api',
        'graphql',
        '-f',
        `query=${PR_FILE_VIEWED_STATES_QUERY}`,
        '-f',
        `owner=${ownerRepo.owner}`,
        '-f',
        `repo=${ownerRepo.repo}`,
        '-F',
        `number=${prNumber}`
      ]
      if (after) {
        args.push('-f', `after=${after}`)
      }
      noteRateLimitSpend('graphql')
      const { stdout } = await ghExecFileAsync(args, ghOptions)
      const parsed = JSON.parse(stdout) as {
        data?: {
          repository?: {
            pullRequest?: {
              id?: string
              files?: {
                pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
                nodes?: {
                  path?: string | null
                  viewerViewedState?: GitHubPRFileViewedState | null
                }[]
              }
            } | null
          } | null
        }
        errors?: { message?: string }[]
      }
      if (parsed.errors?.length) {
        return null
      }
      const pullRequest = parsed.data?.repository?.pullRequest
      if (!pullRequest?.id) {
        return null
      }
      pullRequestId = pullRequest.id
      for (const file of pullRequest.files?.nodes ?? []) {
        if (file.path && file.viewerViewedState) {
          viewedStates.set(file.path, file.viewerViewedState)
        }
      }
      const pageInfo = pullRequest.files?.pageInfo
      if (!pageInfo?.hasNextPage || !pageInfo.endCursor) {
        break
      }
      after = pageInfo.endCursor
    }
  } catch {
    return null
  }
  return pullRequestId ? { pullRequestId, viewedStates } : null
}

export function mergePullRequestFileViewedStates(
  files: GitHubPRFile[],
  viewedStates: PRFileViewedStatesResult | null
): GitHubPRFile[] {
  if (!viewedStates) {
    return files
  }
  return files.map((file) => ({
    ...file,
    viewerViewedState: viewedStates.viewedStates.get(file.path) ?? 'UNVIEWED'
  }))
}
