import type {
  GitHubCommentResult,
  GitHubPRReviewCommentInput,
  PRComment
} from '@yiru/runtime-protocol/workbench/types'

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
import { noteRateLimitSpend, rateLimitGuard } from './rate-limit'

export async function setPRFileViewed(args: {
  repoPath: string
  connectionId?: string | null
  localGitOptions?: LocalGitExecOptions
  pullRequestId: string
  path: string
  viewed: boolean
}): Promise<boolean> {
  const ghOptions = ghRepoExecOptions(
    githubRepoContext(args.repoPath, args.connectionId, args.localGitOptions)
  )
  const mutation = args.viewed ? 'markFileAsViewed' : 'unmarkFileAsViewed'
  const query = `mutation($pullRequestId: ID!, $path: String!) {
    ${mutation}(input: { pullRequestId: $pullRequestId, path: $path }) {
      pullRequest { id }
    }
  }`
  await acquire()
  try {
    await ghExecFileAsync(
      [
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-f',
        `pullRequestId=${args.pullRequestId}`,
        '-f',
        `path=${args.path}`
      ],
      ghOptions
    )
    return true
  } catch (err) {
    console.warn(`${mutation} failed:`, err)
    return false
  } finally {
    release()
  }
}

/**
 * Resolve or unresolve a PR review thread via GraphQL.
 */
export async function resolveReviewThread(
  repoPath: string,
  threadId: string,
  resolve: boolean,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<boolean> {
  const mutation = resolve ? 'resolveReviewThread' : 'unresolveReviewThread'
  const query = `mutation($threadId: ID!) { ${mutation}(input: { threadId: $threadId }) { thread { isResolved } } }`
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const guard = rateLimitGuard('graphql')
  if (guard.blocked) {
    console.warn(
      `${mutation} skipped: GitHub GraphQL rate limit nearly exhausted (${guard.remaining}/${guard.limit})`
    )
    return false
  }
  await acquire()
  try {
    noteRateLimitSpend('graphql')
    await ghExecFileAsync(
      ['api', 'graphql', '-f', `query=${query}`, '-f', `threadId=${threadId}`],
      ghOptions
    )
    return true
  } catch (err) {
    console.warn(`${mutation} failed:`, err)
    return false
  } finally {
    release()
  }
}

export function mapReviewCommentResponse(
  data: {
    id?: number
    user: { login: string; avatar_url: string; type?: string } | null
    body?: string
    created_at?: string
    html_url?: string
    path?: string
    line?: number | null
  },
  body: string,
  path?: string,
  line?: number,
  startLine?: number,
  threadId?: string
): PRComment {
  return {
    id: data.id ?? Date.now(),
    author: data.user?.login ?? 'You',
    authorAvatarUrl: data.user?.avatar_url ?? '',
    body: data.body ?? body,
    createdAt: data.created_at ?? new Date().toISOString(),
    url: data.html_url ?? '',
    isBot: data.user?.type === 'Bot',
    path: data.path ?? path,
    line: data.line ?? line,
    startLine,
    threadId
  }
}

export async function addPRReviewCommentReply(
  repoPath: string,
  prNumber: number,
  commentId: number,
  body: string,
  threadId?: string,
  path?: string,
  line?: number,
  connectionId?: string | null,
  prRepo?: OwnerRepo | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitHubCommentResult> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = prRepo ?? (await getOwnerRepo(repoPath, connectionId, localGitOptions))
  if (!ownerRepo) {
    return { ok: false, error: 'Could not resolve GitHub owner/repo for this repository' }
  }
  await acquire()
  try {
    const { stdout } = await ghExecFileAsync(
      [
        'api',
        '-X',
        'POST',
        `repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${prNumber}/comments/${commentId}/replies`,
        '--raw-field',
        `body=${body}`
      ],
      ghOptions
    )
    const data = JSON.parse(stdout) as Parameters<typeof mapReviewCommentResponse>[0]
    if (typeof data.id !== 'number' || !Number.isSafeInteger(data.id) || data.id < 1) {
      return { ok: false, error: 'Unexpected response from GitHub' }
    }
    return {
      ok: true,
      comment: mapReviewCommentResponse(data, body, path, line, undefined, threadId)
    }
  } catch (err) {
    const stderr = err instanceof Error ? err.message : String(err)
    return { ok: false, error: classifyGhError(stderr).message }
  } finally {
    release()
  }
}

export async function addPRReviewComment(
  args: GitHubPRReviewCommentInput & {
    connectionId?: string | null
    localGitOptions?: LocalGitExecOptions
  }
): Promise<GitHubCommentResult> {
  const ghOptions = ghRepoExecOptions(
    githubRepoContext(args.repoPath, args.connectionId, args.localGitOptions)
  )
  const ownerRepo = await getOwnerRepo(args.repoPath, args.connectionId, args.localGitOptions)
  if (!ownerRepo) {
    return { ok: false, error: 'Could not resolve GitHub owner/repo for this repository' }
  }
  await acquire()
  try {
    const fields = [
      'api',
      '-X',
      'POST',
      `repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls/${args.prNumber}/comments`,
      '--raw-field',
      `body=${args.body}`,
      '--raw-field',
      `commit_id=${args.commitId}`,
      '--raw-field',
      `path=${args.path}`,
      '--field',
      `line=${String(args.line)}`,
      '--raw-field',
      'side=RIGHT'
    ]
    if (typeof args.startLine === 'number' && args.startLine !== args.line) {
      fields.push(
        '--field',
        `start_line=${String(args.startLine)}`,
        '--raw-field',
        'start_side=RIGHT'
      )
    }
    const { stdout } = await ghExecFileAsync(fields, ghOptions)
    return {
      ok: true,
      comment: mapReviewCommentResponse(
        JSON.parse(stdout),
        args.body,
        args.path,
        args.line,
        args.startLine
      )
    }
  } catch (err) {
    const stderr = err instanceof Error ? err.message : String(err)
    return { ok: false, error: classifyGhError(stderr).message }
  } finally {
    release()
  }
}

/**
 * Merge a PR by number using gh CLI.
 * method: 'merge' | 'squash' | 'rebase' (default: 'squash')
 */
