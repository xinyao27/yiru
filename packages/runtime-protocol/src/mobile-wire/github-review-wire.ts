import { z } from 'zod'

import type {
  GitHubAssignableUser,
  GitHubCommentResult,
  GitHubRerunPRChecksResult,
  GitHubWorkItemDetails,
  PRCheckDetail,
  PRCheckRunDetails
} from '../model/review.js'
import {
  MobileHostedReviewDecisionSchema,
  MobileHostedReviewMergeableSchema,
  MobileHostedReviewStateSchema
} from './hosted-review-wire.js'

export const MOBILE_GITHUB_DETAILS_ORPC_PATH = '/github/workItemDetails'
export const MOBILE_GITHUB_CHECKS_ORPC_PATH = '/github/prChecks'
export const MOBILE_GITHUB_CHECK_DETAILS_ORPC_PATH = '/github/prCheckDetails'
export const MOBILE_GITHUB_ASSIGNABLE_USERS_ORPC_PATH = '/github/listAssignableUsers'
export const MOBILE_GITHUB_UPDATE_PR_ORPC_PATH = '/github/updatePR'
export const MOBILE_GITHUB_MERGE_PR_ORPC_PATH = '/github/mergePR'
export const MOBILE_GITHUB_AUTO_MERGE_ORPC_PATH = '/github/setPRAutoMerge'
export const MOBILE_GITHUB_UPDATE_STATE_ORPC_PATH = '/github/updatePRState'
export const MOBILE_GITHUB_REQUEST_REVIEWERS_ORPC_PATH = '/github/requestPRReviewers'
export const MOBILE_GITHUB_REMOVE_REVIEWERS_ORPC_PATH = '/github/removePRReviewers'
export const MOBILE_GITHUB_ADD_COMMENT_ORPC_PATH = '/github/addPRComment'
export const MOBILE_GITHUB_REPLY_COMMENT_ORPC_PATH = '/github/addPRReviewCommentReply'
export const MOBILE_GITHUB_RERUN_CHECKS_ORPC_PATH = '/github/rerunPRChecks'
export const MOBILE_GITHUB_RESOLVE_THREAD_ORPC_PATH = '/github/resolveReviewThread'

export const MobileGitHubRepoIdentitySchema = z.object({ owner: z.string(), repo: z.string() })
export const MobileGitHubReviewRequestSchema = z.object({
  repo: z.string().min(1),
  number: z.number().int().positive(),
  type: z.literal('pr').optional()
})
export const MobileGitHubChecksRequestSchema = z.object({
  repo: z.string().min(1),
  prNumber: z.number().int().positive(),
  headSha: z.string().optional(),
  prRepo: MobileGitHubRepoIdentitySchema.nullable().optional()
})
export const MobileGitHubCheckDetailsRequestSchema = z.object({
  repo: z.string().min(1),
  checkRunId: z.number().int().positive().optional(),
  workflowRunId: z.number().int().positive().optional(),
  checkName: z.string().optional(),
  url: z.string().nullable().optional(),
  prRepo: MobileGitHubRepoIdentitySchema.nullable().optional()
})
export const MobileGitHubAssignableUserSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string()
})
export const MobileGitHubReviewSummarySchema = z.object({
  login: z.string(),
  state: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional()
})
export const MobileGitHubCheckSchema = z.object({
  name: z.string(),
  status: z.enum(['queued', 'in_progress', 'completed']),
  conclusion: z
    .enum([
      'success',
      'failure',
      'cancelled',
      'timed_out',
      'neutral',
      'skipped',
      'pending',
      'action_required'
    ])
    .nullable(),
  url: z.string().nullable(),
  checkRunId: z.number().optional(),
  workflowRunId: z.number().optional()
})
export const MobileGitHubCheckAnnotationSchema = z.object({
  path: z.string().nullable(),
  startLine: z.number().nullable(),
  endLine: z.number().nullable(),
  annotationLevel: z.string().nullable(),
  title: z.string().nullable(),
  message: z.string(),
  rawDetails: z.string().nullable()
})
export const MobileGitHubCheckStepSchema = z.object({
  name: z.string(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable()
})
export const MobileGitHubCheckJobSchema = z.object({
  id: z.number().nullable(),
  name: z.string(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  url: z.string().nullable(),
  logTail: z.string().nullable(),
  steps: z.array(MobileGitHubCheckStepSchema)
})
export const MobileGitHubCheckRunDetailsSchema = z.object({
  name: z.string(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  url: z.string().nullable(),
  detailsUrl: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  text: z.string().nullable(),
  annotations: z.array(MobileGitHubCheckAnnotationSchema),
  jobs: z.array(MobileGitHubCheckJobSchema)
})
export const MobileGitHubReactionSchema = z.object({
  content: z.enum(['+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes']),
  count: z.number()
})
export const MobileGitHubCommentSchema = z.object({
  id: z.number(),
  author: z.string(),
  authorAvatarUrl: z.string(),
  body: z.string(),
  createdAt: z.string(),
  url: z.string(),
  reactions: z.array(MobileGitHubReactionSchema).optional(),
  path: z.string().optional(),
  threadId: z.string().optional(),
  isResolved: z.boolean().optional(),
  isOutdated: z.boolean().optional(),
  line: z.number().optional(),
  startLine: z.number().optional(),
  isBot: z.boolean().optional()
})
export const MobileGitHubPRFileSchema = z.object({
  path: z.string(),
  oldPath: z.string().optional(),
  status: z.enum(['added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged']),
  additions: z.number(),
  deletions: z.number(),
  isBinary: z.boolean(),
  reviewCommentLineNumbers: z.array(z.number()).optional(),
  viewerViewedState: z.enum(['DISMISSED', 'VIEWED', 'UNVIEWED']).optional()
})
export const MobileGitHubWorkItemSchema = z.object({
  id: z.string(),
  type: z.literal('pr'),
  number: z.number().int().positive(),
  title: z.string(),
  state: MobileHostedReviewStateSchema,
  url: z.string(),
  labels: z.array(z.string()),
  updatedAt: z.string(),
  author: z.string().nullable(),
  authorAvatarUrl: z.string().optional(),
  branchName: z.string().optional(),
  baseRefName: z.string().optional(),
  headSha: z.string().optional(),
  additions: z.number().optional(),
  deletions: z.number().optional(),
  changedFiles: z.number().optional(),
  reviewDecision: MobileHostedReviewDecisionSchema.optional(),
  reviewRequests: z.array(MobileGitHubAssignableUserSchema).optional(),
  latestReviews: z.array(MobileGitHubReviewSummarySchema).optional(),
  assignees: z.array(MobileGitHubAssignableUserSchema).optional(),
  mergeable: MobileHostedReviewMergeableSchema.optional(),
  autoMergeEnabled: z.boolean().optional(),
  autoMergeAllowed: z.boolean().nullable().optional(),
  mergeQueueRequired: z.boolean().nullable().optional(),
  mergeStateStatus: z.string().nullable().optional(),
  prRepo: MobileGitHubRepoIdentitySchema.optional()
})
export const MobileGitHubWorkItemDetailsSchema = z.object({
  item: MobileGitHubWorkItemSchema,
  body: z.string(),
  comments: z.array(MobileGitHubCommentSchema),
  headSha: z.string().optional(),
  baseSha: z.string().optional(),
  pullRequestId: z.string().optional(),
  checks: z.array(MobileGitHubCheckSchema).optional(),
  files: z.array(MobileGitHubPRFileSchema).optional(),
  filesUnavailable: z.boolean().optional(),
  participants: z.array(MobileGitHubAssignableUserSchema).optional(),
  assignees: z.array(z.string()).optional()
})

export const MobileGitHubUpdateRequestSchema = z.object({
  repo: z.string().min(1),
  prNumber: z.number().int().positive(),
  updates: z.object({ title: z.string().optional(), body: z.string().optional() }),
  prRepo: MobileGitHubRepoIdentitySchema.nullable().optional()
})
export const MobileGitHubMergeRequestSchema = z.object({
  repo: z.string().min(1),
  prNumber: z.number().int().positive(),
  method: z.enum(['merge', 'squash', 'rebase']).optional(),
  prRepo: MobileGitHubRepoIdentitySchema.nullable().optional()
})
export const MobileGitHubAutoMergeRequestSchema = MobileGitHubMergeRequestSchema.extend({
  enabled: z.boolean()
})
export const MobileGitHubStateRequestSchema = z.object({
  repo: z.string().min(1),
  prNumber: z.number().int().positive(),
  updates: z.object({ state: z.enum(['open', 'closed']) })
})
export const MobileGitHubReviewersRequestSchema = z.object({
  repo: z.string().min(1),
  prNumber: z.number().int().positive(),
  reviewers: z.array(z.string()).min(1)
})
export const MobileGitHubCommentRequestSchema = z.object({
  repo: z.string().min(1),
  number: z.number().int().positive(),
  body: z.string().min(1),
  prRepo: MobileGitHubRepoIdentitySchema.nullable().optional()
})
export const MobileGitHubReplyCommentRequestSchema = z.object({
  repo: z.string().min(1),
  prNumber: z.number().int().positive(),
  commentId: z.number().int().positive(),
  body: z.string().min(1),
  threadId: z.string().optional(),
  path: z.string().optional(),
  line: z.number().int().positive().optional(),
  prRepo: MobileGitHubRepoIdentitySchema.nullable().optional()
})
export const MobileGitHubRerunChecksRequestSchema = MobileGitHubChecksRequestSchema.extend({
  failedOnly: z.boolean().optional()
})
export const MobileGitHubResolveThreadRequestSchema = z.object({
  repo: z.string().min(1),
  threadId: z.string().min(1),
  resolve: z.boolean()
})
export const MobileGitHubMutationResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional()
})
export const MobileGitHubCommentResultSchema = z.object({
  ok: z.boolean(),
  comment: MobileGitHubCommentSchema.optional(),
  error: z.string().optional()
})
export const MobileGitHubRerunResultSchema = z.object({
  ok: z.boolean(),
  count: z.number().optional(),
  error: z.string().optional()
})

export const MOBILE_GITHUB_DETAILS_WIRE_IS_COMPATIBLE: GitHubWorkItemDetails extends z.infer<
  typeof MobileGitHubWorkItemDetailsSchema
>
  ? true
  : false = true
export const MOBILE_GITHUB_CHECKS_WIRE_IS_COMPATIBLE: PRCheckDetail[] extends z.infer<
  typeof MobileGitHubCheckSchema
>[]
  ? true
  : false = true
export const MOBILE_GITHUB_CHECK_DETAILS_WIRE_IS_COMPATIBLE: PRCheckRunDetails extends z.infer<
  typeof MobileGitHubCheckRunDetailsSchema
>
  ? true
  : false = true
export const MOBILE_GITHUB_USERS_WIRE_IS_COMPATIBLE: GitHubAssignableUser[] extends z.infer<
  typeof MobileGitHubAssignableUserSchema
>[]
  ? true
  : false = true
export const MOBILE_GITHUB_COMMENT_WIRE_IS_COMPATIBLE: GitHubCommentResult extends z.infer<
  typeof MobileGitHubCommentResultSchema
>
  ? true
  : false = true
export const MOBILE_GITHUB_RERUN_WIRE_IS_COMPATIBLE: GitHubRerunPRChecksResult extends z.infer<
  typeof MobileGitHubRerunResultSchema
>
  ? true
  : false = true
