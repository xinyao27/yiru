import type {
  GitLabDiscussionResolveResult,
  GitLabWorkItemDetails,
  PRComment
} from '@yiru/runtime-protocol/workbench/types'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

import type { ChecksPanelReview } from './review'

export function isGitLabChecksPanelReview(
  review: ChecksPanelReview | null
): review is ChecksPanelReview & { provider: 'gitlab' } {
  return review?.provider === 'gitlab'
}

export function gitLabMRCommentsToPRComments(
  comments: GitLabWorkItemDetails['comments'] | undefined
): PRComment[] {
  return (comments ?? []).map((comment) => {
    const { reactions: _reactions, ...compatibleComment } = comment
    // Why: the shared comments renderer expects GitHub reaction content enums;
    // GitLab emoji award names are open-ended, so omit them in this view.
    return compatibleComment
  })
}

export async function fetchGitLabMRDetailsForChecks(args: {
  repoPath: string
  repoId?: string
  settings: Parameters<typeof getActiveRuntimeTarget>[0]
  iid: number
}): Promise<GitLabWorkItemDetails | null> {
  const target = getActiveRuntimeTarget(args.settings)
  return callRuntimeOrpc(
    target,
    (client) => client.gitlab.workItemDetails,
    {
      repo: args.repoId ?? args.repoPath,
      iid: args.iid,
      type: 'mr'
    },
    { timeoutMs: 30_000 }
  )
}

export async function resolveGitLabMRDiscussionForChecks(args: {
  repoPath: string
  repoId?: string
  settings: Parameters<typeof getActiveRuntimeTarget>[0]
  iid: number
  discussionId: string
  resolved: boolean
}): Promise<GitLabDiscussionResolveResult> {
  const target = getActiveRuntimeTarget(args.settings)
  return callRuntimeOrpc(
    target,
    (client) => client.gitlab.resolveMRDiscussion,
    {
      repo: args.repoId ?? args.repoPath,
      iid: args.iid,
      discussionId: args.discussionId,
      resolved: args.resolved
    },
    { timeoutMs: 30_000 }
  )
}
