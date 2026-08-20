import type {
  CreateHostedReviewResult,
  HostedReviewCreationEligibility,
  HostedReviewInfo
} from '@yiru/workbench-model/review'
import { z } from 'zod'

export const MOBILE_HOSTED_REVIEW_FOR_BRANCH_ORPC_PATH = '/hostedReview/forBranch'
export const MOBILE_HOSTED_REVIEW_ELIGIBILITY_ORPC_PATH = '/hostedReview/getCreationEligibility'
export const MOBILE_HOSTED_REVIEW_CREATE_ORPC_PATH = '/hostedReview/create'

export const MobileHostedReviewProviderSchema = z.enum([
  'github',
  'gitlab',
  'bitbucket',
  'azure-devops',
  'gitea',
  'unsupported'
])
export const MobileHostedReviewStateSchema = z.enum(['open', 'closed', 'merged', 'draft'])
export const MobileHostedReviewCheckStatusSchema = z.enum([
  'pending',
  'success',
  'failure',
  'neutral'
])
export const MobileHostedReviewMergeableSchema = z.enum(['MERGEABLE', 'CONFLICTING', 'UNKNOWN'])
export const MobileHostedReviewDecisionSchema = z
  .enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'])
  .nullable()

export const MobileHostedReviewForBranchRequestSchema = z.object({
  repo: z.string().min(1),
  branch: z.string().min(1),
  currentHeadOid: z.string().nullable().optional(),
  linkedGitHubPR: z.number().int().positive().nullable().optional(),
  linkedGitLabMR: z.number().int().positive().nullable().optional()
})

export const MobileHostedReviewInfoSchema = z.object({
  provider: MobileHostedReviewProviderSchema,
  number: z.number().int().positive(),
  title: z.string(),
  state: MobileHostedReviewStateSchema,
  url: z.string(),
  status: MobileHostedReviewCheckStatusSchema,
  updatedAt: z.string(),
  mergeable: MobileHostedReviewMergeableSchema,
  reviewDecision: MobileHostedReviewDecisionSchema.optional(),
  autoMergeEnabled: z.boolean().optional(),
  autoMergeAllowed: z.boolean().nullable().optional(),
  mergeQueueRequired: z.boolean().nullable().optional(),
  mergeMethodSettings: z
    .object({
      defaultMethod: z.enum(['merge', 'squash', 'rebase']),
      allowedMethods: z.object({
        merge: z.boolean(),
        squash: z.boolean(),
        rebase: z.boolean()
      })
    })
    .optional(),
  mergeStateStatus: z.string().nullable().optional(),
  headSha: z.string().optional(),
  confirmedContainedHeadOid: z.string().optional(),
  baseRefName: z.string().optional(),
  conflictSummary: z
    .object({
      baseRef: z.string(),
      baseCommit: z.string(),
      commitsBehind: z.number(),
      files: z.array(z.string()),
      localMergeState: z.literal('clean').optional()
    })
    .optional()
})

export const MobileHostedReviewEligibilityRequestSchema = z.object({
  repo: z.string().min(1),
  worktree: z.string().min(1),
  branch: z.string().min(1),
  base: z.string().nullable().optional(),
  hasUncommittedChanges: z.boolean().optional(),
  hasUpstream: z.boolean().optional(),
  ahead: z.number().int().nonnegative().optional(),
  behind: z.number().int().nonnegative().optional(),
  linkedGitHubPR: z.number().int().positive().nullable().optional(),
  linkedGitLabMR: z.number().int().positive().nullable().optional()
})
export const MobileHostedReviewSummarySchema = z.object({
  number: z.number().int().positive().optional(),
  url: z.string()
})
export const MobileHostedReviewEligibilitySchema = z.object({
  provider: MobileHostedReviewProviderSchema,
  review: MobileHostedReviewSummarySchema.nullable(),
  canCreate: z.boolean(),
  blockedReason: z
    .enum([
      'dirty',
      'detached_head',
      'default_branch',
      'no_upstream',
      'needs_push',
      'needs_sync',
      'auth_required',
      'fork_head_unsupported',
      'unsupported_provider',
      'existing_review',
      'base_not_on_remote'
    ])
    .nullable(),
  nextAction: z
    .enum(['commit', 'publish', 'push', 'sync', 'authenticate', 'open_existing_review'])
    .nullable(),
  defaultBaseRef: z.string().nullable().optional(),
  head: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  body: z.string().nullable().optional()
})
export const MobileHostedReviewCreateRequestSchema = z.object({
  repo: z.string().min(1),
  worktree: z.string().min(1),
  provider: MobileHostedReviewProviderSchema,
  base: z.string().min(1),
  head: z.string().optional(),
  title: z.string().min(1),
  body: z.string().optional(),
  draft: z.boolean().optional(),
  useTemplate: z.boolean().optional()
})
export const MobileHostedReviewCreateResultSchema = z.object({
  ok: z.boolean(),
  number: z.number().int().positive().optional(),
  url: z.string().optional(),
  code: z.string().optional(),
  error: z.string().optional(),
  existingReview: MobileHostedReviewSummarySchema.optional()
})

export const MOBILE_HOSTED_REVIEW_INFO_WIRE_IS_COMPATIBLE: HostedReviewInfo extends z.infer<
  typeof MobileHostedReviewInfoSchema
>
  ? true
  : false = true
export const MOBILE_HOSTED_REVIEW_ELIGIBILITY_WIRE_IS_COMPATIBLE: HostedReviewCreationEligibility extends z.infer<
  typeof MobileHostedReviewEligibilitySchema
>
  ? true
  : false = true
export const MOBILE_HOSTED_REVIEW_CREATE_WIRE_IS_COMPATIBLE: CreateHostedReviewResult extends z.infer<
  typeof MobileHostedReviewCreateResultSchema
>
  ? true
  : false = true
