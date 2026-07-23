import { z } from 'zod'

import {
  OptionalFiniteNumber,
  OptionalString,
  requiredString
} from '../../../../shared/runtime-method-contracts/runtime-method-params'

export const RepoSelector = z.object({
  repo: requiredString('Missing repo selector')
})

export const WorkItemsList = RepoSelector.extend({
  limit: OptionalFiniteNumber,
  query: OptionalString,
  page: z.number().int().positive().optional(),
  noCache: z.boolean().optional()
})

export const WorkItem = RepoSelector.extend({
  number: z.number().int().positive(),
  type: z.literal('pr').optional()
})

export const WorkItemByOwnerRepo = RepoSelector.extend({
  owner: requiredString('Missing owner'),
  ownerRepo: requiredString('Missing repo'),
  number: z.number().int().positive(),
  type: z.literal('pr')
})

export const WorkItemDetails = WorkItem

export const RateLimit = z.object({
  force: z.boolean().optional()
})

export const SlugRepo = z.object({
  owner: requiredString('Missing owner'),
  repo: requiredString('Missing repo')
})

export const PrForBranch = RepoSelector.extend({
  branch: requiredString('Missing branch'),
  linkedPRNumber: z.number().int().positive().nullable().optional(),
  fallbackPRNumber: z.number().int().positive().nullable().optional(),
  acceptMergedFallbackPR: z.boolean().optional(),
  currentHeadOid: z.string().nullable().optional()
})

export const PullRequest = RepoSelector.extend({
  prNumber: z.number().int().positive(),
  noCache: z.boolean().optional(),
  prRepo: SlugRepo.nullable().optional()
})

export const PullRequestChecks = PullRequest.extend({
  headSha: OptionalString
})

export const PullRequestCheckDetails = RepoSelector.extend({
  checkRunId: z.number().int().positive().optional(),
  workflowRunId: z.number().int().positive().optional(),
  checkName: OptionalString,
  url: OptionalString.nullable().optional(),
  prRepo: SlugRepo.nullable().optional()
})

export const RerunPullRequestChecks = PullRequest.extend({
  headSha: OptionalString,
  failedOnly: z.boolean().optional()
})

export const PullRequestFileContents = RepoSelector.extend({
  prNumber: z.number().int().positive(),
  path: requiredString('Missing file path'),
  oldPath: OptionalString,
  status: z.enum(['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']),
  headSha: requiredString('Missing head SHA'),
  baseSha: requiredString('Missing base SHA')
})

export const PullRequestFileViewed = RepoSelector.extend({
  pullRequestId: requiredString('Missing pull request ID'),
  path: requiredString('Missing file path'),
  viewed: z.boolean()
})

export const ReviewThread = RepoSelector.extend({
  threadId: requiredString('Missing thread ID'),
  resolve: z.boolean()
})

export const UpdatePrTitle = RepoSelector.extend({
  prNumber: z.number().int().positive(),
  title: requiredString('Missing title'),
  prRepo: SlugRepo.nullable().optional()
})

export const UpdatePr = RepoSelector.extend({
  prNumber: z.number().int().positive(),
  updates: z.object({
    title: OptionalString,
    body: z.string().optional()
  }),
  prRepo: SlugRepo.nullable().optional()
})

export const MergePr = RepoSelector.extend({
  prNumber: z.number().int().positive(),
  method: z.enum(['merge', 'squash', 'rebase']).optional(),
  prRepo: SlugRepo.nullable().optional()
})

export const SetPrAutoMerge = RepoSelector.extend({
  prNumber: z.number().int().positive(),
  enabled: z.boolean(),
  method: z.enum(['merge', 'squash', 'rebase']).optional(),
  prRepo: SlugRepo.nullable().optional()
})

export const UpdatePrState = RepoSelector.extend({
  prNumber: z.number().int().positive(),
  updates: z.object({
    state: z.enum(['open', 'closed'])
  })
})

export const RequestPrReviewers = RepoSelector.extend({
  prNumber: z.number().int().positive(),
  reviewers: z.array(z.string()).min(1)
})

export const RemovePrReviewers = RepoSelector.extend({
  prNumber: z.number().int().positive(),
  reviewers: z.array(z.string()).min(1)
})

export const PullRequestComment = RepoSelector.extend({
  number: z.number().int().positive(),
  body: requiredString('Comment body required'),
  prRepo: SlugRepo.nullable().optional()
})

export const PRReviewComment = RepoSelector.extend({
  prNumber: z.number().int().positive(),
  commitId: requiredString('Missing PR head SHA'),
  path: requiredString('File path required'),
  line: z.number().int().positive(),
  startLine: z.number().int().positive().optional(),
  body: requiredString('Comment body required')
})

export const PRReviewCommentReply = RepoSelector.extend({
  prNumber: z.number().int().positive(),
  commentId: z.number().int().positive(),
  body: requiredString('Comment body required'),
  threadId: OptionalString,
  path: OptionalString,
  line: z.number().int().positive().optional(),
  prRepo: SlugRepo.nullable().optional()
})
