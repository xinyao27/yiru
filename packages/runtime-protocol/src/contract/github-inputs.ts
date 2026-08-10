import { z } from 'zod'

const OptionalFiniteNumber = z
  .unknown()
  .transform((value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined))
  .pipe(z.union([z.number(), z.undefined()]))
  .optional()

const OptionalString = z
  .unknown()
  .transform((value) => (typeof value === 'string' && value.length > 0 ? value : undefined))
  .pipe(z.union([z.string(), z.undefined()]))
  .optional()

function requiredString(message: string) {
  return z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, message))
}

export const GitHubRepoSelectorInputSchema = z.object({
  repo: requiredString('Missing repo selector')
})

export const GitHubListWorkItemsInputSchema = GitHubRepoSelectorInputSchema.extend({
  limit: OptionalFiniteNumber,
  query: OptionalString,
  page: z.number().int().positive().optional(),
  noCache: z.boolean().optional()
})

export const GitHubWorkItemInputSchema = GitHubRepoSelectorInputSchema.extend({
  number: z.number().int().positive(),
  type: z.literal('pr').optional()
})

export const GitHubWorkItemByOwnerRepoInputSchema = GitHubRepoSelectorInputSchema.extend({
  owner: requiredString('Missing owner'),
  ownerRepo: requiredString('Missing repo'),
  number: z.number().int().positive(),
  type: z.literal('pr')
})

export const GitHubRateLimitInputSchema = z.object({
  force: z.boolean().optional()
})

export const GitHubSlugRepoInputSchema = z.object({
  owner: requiredString('Missing owner'),
  repo: requiredString('Missing repo')
})

export const GitHubPrForBranchInputSchema = GitHubRepoSelectorInputSchema.extend({
  branch: requiredString('Missing branch'),
  linkedPRNumber: z.number().int().positive().nullable().optional(),
  fallbackPRNumber: z.number().int().positive().nullable().optional(),
  acceptMergedFallbackPR: z.boolean().optional(),
  currentHeadOid: z.string().nullable().optional()
})

export const GitHubPullRequestInputSchema = GitHubRepoSelectorInputSchema.extend({
  prNumber: z.number().int().positive(),
  noCache: z.boolean().optional(),
  prRepo: GitHubSlugRepoInputSchema.nullable().optional()
})

export const GitHubPullRequestChecksInputSchema = GitHubPullRequestInputSchema.extend({
  headSha: OptionalString
})

export const GitHubPullRequestCheckDetailsInputSchema = GitHubRepoSelectorInputSchema.extend({
  checkRunId: z.number().int().positive().optional(),
  workflowRunId: z.number().int().positive().optional(),
  checkName: OptionalString,
  url: OptionalString.nullable().optional(),
  prRepo: GitHubSlugRepoInputSchema.nullable().optional()
})

export const GitHubRerunPullRequestChecksInputSchema = GitHubPullRequestInputSchema.extend({
  headSha: OptionalString,
  failedOnly: z.boolean().optional()
})

export const GitHubPullRequestFileContentsInputSchema = GitHubRepoSelectorInputSchema.extend({
  prNumber: z.number().int().positive(),
  path: requiredString('Missing file path'),
  oldPath: OptionalString,
  status: z.enum(['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']),
  headSha: requiredString('Missing head SHA'),
  baseSha: requiredString('Missing base SHA')
})

export const GitHubPullRequestFileViewedInputSchema = GitHubRepoSelectorInputSchema.extend({
  pullRequestId: requiredString('Missing pull request ID'),
  path: requiredString('Missing file path'),
  viewed: z.boolean()
})

export const GitHubReviewThreadInputSchema = GitHubRepoSelectorInputSchema.extend({
  threadId: requiredString('Missing thread ID'),
  resolve: z.boolean()
})

export const GitHubUpdatePrTitleInputSchema = GitHubRepoSelectorInputSchema.extend({
  prNumber: z.number().int().positive(),
  title: requiredString('Missing title'),
  prRepo: GitHubSlugRepoInputSchema.nullable().optional()
})

export const GitHubUpdatePrInputSchema = GitHubRepoSelectorInputSchema.extend({
  prNumber: z.number().int().positive(),
  updates: z.object({
    title: OptionalString,
    body: z.string().optional()
  }),
  prRepo: GitHubSlugRepoInputSchema.nullable().optional()
})

export const GitHubMergePrInputSchema = GitHubRepoSelectorInputSchema.extend({
  prNumber: z.number().int().positive(),
  method: z.enum(['merge', 'squash', 'rebase']).optional(),
  prRepo: GitHubSlugRepoInputSchema.nullable().optional()
})

export const GitHubSetPrAutoMergeInputSchema = GitHubRepoSelectorInputSchema.extend({
  prNumber: z.number().int().positive(),
  enabled: z.boolean(),
  method: z.enum(['merge', 'squash', 'rebase']).optional(),
  prRepo: GitHubSlugRepoInputSchema.nullable().optional()
})

export const GitHubUpdatePrStateInputSchema = GitHubRepoSelectorInputSchema.extend({
  prNumber: z.number().int().positive(),
  updates: z.object({ state: z.enum(['open', 'closed']) })
})

export const GitHubRequestPrReviewersInputSchema = GitHubRepoSelectorInputSchema.extend({
  prNumber: z.number().int().positive(),
  reviewers: z.array(z.string()).min(1)
})

export const GitHubPullRequestCommentInputSchema = GitHubRepoSelectorInputSchema.extend({
  number: z.number().int().positive(),
  body: requiredString('Comment body required'),
  prRepo: GitHubSlugRepoInputSchema.nullable().optional()
})

export const GitHubPrReviewCommentInputSchema = GitHubRepoSelectorInputSchema.extend({
  prNumber: z.number().int().positive(),
  commitId: requiredString('Missing PR head SHA'),
  path: requiredString('File path required'),
  line: z.number().int().positive(),
  startLine: z.number().int().positive().optional(),
  body: requiredString('Comment body required')
})

export const GitHubPrReviewCommentReplyInputSchema = GitHubRepoSelectorInputSchema.extend({
  prNumber: z.number().int().positive(),
  commentId: z.number().int().positive(),
  body: requiredString('Comment body required'),
  threadId: OptionalString,
  path: OptionalString,
  line: z.number().int().positive().optional(),
  prRepo: GitHubSlugRepoInputSchema.nullable().optional()
})
