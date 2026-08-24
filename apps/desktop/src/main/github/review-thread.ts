import type { PRComment } from '~shared/types'

import { assertRateLimitBudget } from './client-foundation'
import { mapGraphQLReactionGroups, type GitHubGraphQLReactionGroup } from './comment-reactions'
import {
  ghExecFileAsync,
  acquire,
  release,
  getOwnerRepo,
  ghRepoExecOptions,
  githubRepoContext,
  type LocalGitExecOptions,
  type OwnerRepo
} from './github-cli'
import { noteRateLimitSpend, rateLimitGuard } from './rate-limit'

export const REVIEW_THREADS_QUERY = `
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          line
          startLine
          originalLine
          originalStartLine
          comments(first: 100) {
            nodes {
              databaseId
              author { __typename login avatarUrl(size: 48) }
              body
              createdAt
              url
              path
              reactionGroups {
                content
                reactors {
                  totalCount
                }
              }
            }
          }
        }
      }
      comments(first: 100) {
        nodes {
          databaseId
          author { __typename login avatarUrl(size: 48) }
          body
          createdAt
          url
          reactionGroups {
            content
            reactors {
              totalCount
            }
          }
        }
      }
    }
  }
}`

/**
 * Get all comments on a PR — both top-level conversation comments and inline
 * review comments (including suggestions). Uses GraphQL for review threads
 * to get resolution status, REST for PR conversation comments.
 */
export async function getPRComments(
  repoPath: string,
  prNumber: number,
  options?: { noCache?: boolean; prRepo?: OwnerRepo | null },
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<PRComment[]> {
  const ghOptions = ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions))
  const ownerRepo = options?.prRepo ?? (await getOwnerRepo(repoPath, connectionId, localGitOptions))
  if (ownerRepo) {
    await assertRateLimitBudget('core')
  }
  await acquire()
  try {
    if (ownerRepo) {
      // Why: --cache 60s saves rate-limit budget during normal loads, but when the
      // user explicitly clicks refresh we must skip it so gh fetches fresh data.
      const cacheArgs = options?.noCache ? [] : ['--cache', '60s']
      const base = `repos/${ownerRepo.owner}/${ownerRepo.repo}`

      // Why: use allSettled so a single failing endpoint (e.g. GraphQL
      // permissions, transient network error) doesn't blank out all comments.
      // Each source is parsed independently; failed sources contribute zero
      // comments instead of aborting the entire fetch.
      const reviewThreadsGuard = rateLimitGuard('graphql')
      let reviewThreadsFetch: Promise<{ stdout: string; stderr: string } | null>
      if (reviewThreadsGuard.blocked) {
        reviewThreadsFetch = Promise.resolve(null)
      } else {
        noteRateLimitSpend('graphql')
        reviewThreadsFetch = ghExecFileAsync(
          [
            'api',
            'graphql',
            '-f',
            `query=${REVIEW_THREADS_QUERY}`,
            '-f',
            `owner=${ownerRepo.owner}`,
            '-f',
            `repo=${ownerRepo.repo}`,
            '-F',
            `pr=${prNumber}`
          ],
          ghOptions
        )
      }
      const [conversationResult, threadsResult, reviewsResult] = await Promise.allSettled([
        ghExecFileAsync(
          ['api', ...cacheArgs, `${base}/issues/${prNumber}/comments?per_page=100`],
          ghOptions
        ),
        reviewThreadsFetch,
        // Why: review summaries (approve, request changes, general comments) live
        // under pulls/{n}/reviews, not under PR conversation comments or review threads.
        // Without this, a reviewer who submits "LGTM" without inline threads
        // would have their comment silently dropped from the panel.
        ghExecFileAsync(
          ['api', ...cacheArgs, `${base}/pulls/${prNumber}/reviews?per_page=100`],
          ghOptions
        )
      ])
      noteRateLimitSpend('core', 2)

      // Parse PR conversation comments (REST)
      type RESTComment = {
        id: number
        user: { login: string; avatar_url: string; type?: string } | null
        body: string
        created_at: string
        html_url: string
      }
      let conversationComments: PRComment[] = []
      if (conversationResult.status === 'fulfilled') {
        conversationComments = (JSON.parse(conversationResult.value.stdout) as RESTComment[]).map(
          (c): PRComment => ({
            id: c.id,
            author: c.user?.login ?? 'ghost',
            authorAvatarUrl: c.user?.avatar_url ?? '',
            body: c.body ?? '',
            createdAt: c.created_at,
            url: c.html_url,
            isBot: c.user?.type === 'Bot'
          })
        )
      } else {
        console.warn('Failed to fetch PR conversation comments:', conversationResult.reason)
      }

      // Parse review threads (GraphQL)
      type GQLThread = {
        id: string
        isResolved: boolean
        line: number | null
        startLine: number | null
        originalLine: number | null
        originalStartLine: number | null
        comments: {
          nodes: {
            databaseId: number
            author: { __typename?: string; login: string; avatarUrl: string } | null
            body: string
            createdAt: string
            url: string
            path: string
            reactionGroups?: GitHubGraphQLReactionGroup[] | null
          }[]
        }
      }
      type GQLConversationComment = {
        databaseId: number
        author: { __typename?: string; login: string; avatarUrl: string } | null
        body: string
        createdAt: string
        url: string
        reactionGroups?: GitHubGraphQLReactionGroup[] | null
      }
      const reviewComments: PRComment[] = []
      if (threadsResult.status === 'fulfilled' && threadsResult.value) {
        const threadsData = JSON.parse(threadsResult.value.stdout) as {
          data: {
            repository: {
              pullRequest: {
                reviewThreads: { nodes: GQLThread[] }
                comments?: { nodes: GQLConversationComment[] }
              }
            }
          }
        }
        const pullRequest = threadsData.data.repository.pullRequest
        const graphQLConversationComments = (pullRequest.comments?.nodes ?? []).map(
          (c): PRComment => ({
            id: c.databaseId,
            author: c.author?.login ?? 'ghost',
            authorAvatarUrl: c.author?.avatarUrl ?? '',
            body: c.body ?? '',
            createdAt: c.createdAt,
            url: c.url,
            isBot: c.author?.__typename === 'Bot',
            reactions: mapGraphQLReactionGroups(c.reactionGroups)
          })
        )
        if (graphQLConversationComments.length > 0) {
          conversationComments = graphQLConversationComments
        }

        const threads = pullRequest.reviewThreads.nodes
        for (const thread of threads) {
          for (const c of thread.comments.nodes) {
            reviewComments.push({
              id: c.databaseId,
              author: c.author?.login ?? 'ghost',
              authorAvatarUrl: c.author?.avatarUrl ?? '',
              body: c.body ?? '',
              createdAt: c.createdAt,
              url: c.url,
              isBot: c.author?.__typename === 'Bot',
              reactions: mapGraphQLReactionGroups(c.reactionGroups),
              path: c.path,
              threadId: thread.id,
              isResolved: thread.isResolved,
              isOutdated: thread.line == null,
              // Why: GitHub nulls out line/startLine when the commented code is
              // outdated (e.g. after a force-push). Fall back to originalLine which
              // always preserves the line numbers from when the comment was created.
              line: thread.line ?? thread.originalLine ?? undefined,
              startLine: thread.startLine ?? thread.originalStartLine ?? undefined
            })
          }
        }
      } else {
        if (threadsResult.status === 'rejected') {
          console.warn('Failed to fetch review threads:', threadsResult.reason)
        }
      }

      // Parse review summaries (REST) — only include reviews with a body,
      // since empty-body reviews (e.g. approvals with no comment) add noise.
      type RESTReview = {
        id: number
        user: { login: string; avatar_url: string; type?: string } | null
        body: string
        state: string
        submitted_at: string
        html_url: string
      }
      let reviewSummaries: PRComment[] = []
      if (reviewsResult.status === 'fulfilled') {
        reviewSummaries = (JSON.parse(reviewsResult.value.stdout) as RESTReview[])
          .filter((r) => r.body?.trim())
          .map((r): PRComment => ({
            id: r.id,
            author: r.user?.login ?? 'ghost',
            authorAvatarUrl: r.user?.avatar_url ?? '',
            body: r.body,
            createdAt: r.submitted_at,
            url: r.html_url,
            isBot: r.user?.type === 'Bot'
          }))
      } else {
        console.warn('Failed to fetch review summaries:', reviewsResult.reason)
      }

      const all = [...conversationComments, ...reviewComments, ...reviewSummaries]
      all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      return all
    }

    // Fallback: non-GitHub remote — use gh pr view (only returns PR conversation comments)
    const { stdout } = await ghExecFileAsync(
      ['pr', 'view', String(prNumber), '--json', 'comments'],
      ghOptions
    )
    noteRateLimitSpend('graphql')
    const data = JSON.parse(stdout) as {
      comments: {
        author: { login: string }
        body: string
        createdAt: string
        url: string
      }[]
    }
    return (data.comments ?? []).map((c, i) => ({
      id: i,
      author: c.author?.login ?? 'ghost',
      authorAvatarUrl: '',
      body: c.body ?? '',
      createdAt: c.createdAt,
      url: c.url ?? ''
    }))
  } catch (err) {
    console.warn('getPRComments failed:', err)
    return []
  } finally {
    release()
  }
}

/**
 * Mark or unmark a PR file as viewed via GitHub's GraphQL API.
 */
