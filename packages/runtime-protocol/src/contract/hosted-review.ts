import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import type {
  CreateHostedReviewResult,
  HostedReviewCreationEligibility,
  HostedReviewInfo
} from '../model/review.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

function requiredString(message: string) {
  return z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, message))
}

export const HostedReviewForBranchInputSchema = z.object({
  repo: requiredString('Missing repo selector'),
  branch: requiredString('Missing branch'),
  currentHeadOid: z.string().nullable().optional(),
  linkedGitHubPR: z.number().int().positive().nullable().optional(),
  fallbackGitHubPR: z.number().int().positive().nullable().optional(),
  linkedGitLabMR: z.number().int().positive().nullable().optional(),
  linkedBitbucketPR: z.number().int().positive().nullable().optional(),
  linkedAzureDevOpsPR: z.number().int().positive().nullable().optional(),
  linkedGiteaPR: z.number().int().positive().nullable().optional()
})

export const HostedReviewCreationEligibilityInputSchema = z.object({
  repo: requiredString('Missing repo selector'),
  worktree: z.string().min(1, 'Missing worktree selector').optional(),
  branch: requiredString('Missing branch'),
  base: z.string().nullable().optional(),
  hasUncommittedChanges: z.boolean().optional(),
  hasUpstream: z.boolean().optional(),
  ahead: z.number().int().nonnegative().optional(),
  behind: z.number().int().nonnegative().optional(),
  linkedGitHubPR: z.number().int().positive().nullable().optional(),
  fallbackGitHubPR: z.number().int().positive().nullable().optional(),
  linkedGitLabMR: z.number().int().positive().nullable().optional(),
  linkedBitbucketPR: z.number().int().positive().nullable().optional(),
  linkedAzureDevOpsPR: z.number().int().positive().nullable().optional(),
  linkedGiteaPR: z.number().int().positive().nullable().optional()
})

export const HostedReviewCreateInputSchema = z.object({
  repo: requiredString('Missing repo selector'),
  worktree: z.string().min(1, 'Missing worktree selector').optional(),
  provider: z.enum(['github', 'gitlab', 'bitbucket', 'azure-devops', 'gitea', 'unsupported']),
  base: requiredString('Missing base branch'),
  head: z.string().optional(),
  title: requiredString('Missing title'),
  body: z.string().optional(),
  draft: z.boolean().optional(),
  useTemplate: z.boolean().optional()
})

export type HostedReviewForBranchInput = z.output<typeof HostedReviewForBranchInputSchema>
export type HostedReviewCreationEligibilityInput = z.output<
  typeof HostedReviewCreationEligibilityInputSchema
>
export type HostedReviewCreateInput = z.output<typeof HostedReviewCreateInputSchema>

const HOSTED_REVIEW_READ_ACCESS = { scope: 'project', tier: 'read' } as const
const HOSTED_REVIEW_WRITE_ACCESS = { scope: 'project', tier: 'host' } as const
const MOBILE_CLIENT = { mobile: true } as const

export const hostedReviewContract = {
  forBranch: withAccess(HOSTED_REVIEW_READ_ACCESS, MOBILE_CLIENT)
    .input(HostedReviewForBranchInputSchema)
    .output(type<HostedReviewInfo | null>()),
  getCreationEligibility: withAccess(HOSTED_REVIEW_READ_ACCESS, MOBILE_CLIENT)
    .input(HostedReviewCreationEligibilityInputSchema)
    .output(type<HostedReviewCreationEligibility>()),
  create: withAccess(HOSTED_REVIEW_WRITE_ACCESS, MOBILE_CLIENT)
    .input(HostedReviewCreateInputSchema)
    .output(type<CreateHostedReviewResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
