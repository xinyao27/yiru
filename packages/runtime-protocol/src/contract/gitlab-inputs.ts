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

export const GitLabRepoSelectorInputSchema = z.object({
  repo: requiredString('Missing repo selector')
})

export const GitLabEmptyInputSchema = z.object({}).optional().default({})

export const GitLabRateLimitInputSchema = z
  .object({
    force: z.boolean().optional(),
    host: OptionalString
  })
  .optional()
  .default({})

export const GitLabProjectRefInputSchema = z
  .object({
    host: requiredString('Missing GitLab host'),
    path: requiredString('Missing GitLab project path')
  })
  .optional()

export const GitLabListMrsInputSchema = GitLabRepoSelectorInputSchema.extend({
  state: z.enum(['opened', 'merged', 'closed', 'all']).optional(),
  page: OptionalFiniteNumber,
  perPage: OptionalFiniteNumber,
  query: OptionalString
})

export const GitLabUpdateMrStateInputSchema = GitLabRepoSelectorInputSchema.extend({
  iid: z.number().int().positive(),
  state: z.enum(['opened', 'closed']),
  projectRef: GitLabProjectRefInputSchema
})

export const GitLabUpdateMrInputSchema = GitLabRepoSelectorInputSchema.extend({
  iid: z.number().int().positive(),
  updates: z.object({
    title: z.string().optional(),
    body: z.string().optional(),
    addLabels: z.array(z.string()).optional(),
    removeLabels: z.array(z.string()).optional()
  }),
  projectRef: GitLabProjectRefInputSchema
})

export const GitLabUpdateMrReviewersInputSchema = GitLabRepoSelectorInputSchema.extend({
  iid: z.number().int().positive(),
  reviewerIds: z.array(z.number().int().nonnegative()),
  projectRef: GitLabProjectRefInputSchema
})

export const GitLabMergeMrInputSchema = GitLabRepoSelectorInputSchema.extend({
  iid: z.number().int().positive(),
  method: z.enum(['merge', 'squash', 'rebase']).optional(),
  projectRef: GitLabProjectRefInputSchema
})

export const GitLabAddMrCommentInputSchema = GitLabRepoSelectorInputSchema.extend({
  iid: z.number().int().positive(),
  body: requiredString('Comment body is required'),
  projectRef: GitLabProjectRefInputSchema
})

export const GitLabAddMrInlineCommentInputSchema = GitLabRepoSelectorInputSchema.extend({
  iid: z.number().int().positive(),
  input: z.object({
    body: requiredString('Comment body is required'),
    path: requiredString('File path is required'),
    oldPath: z.string().optional(),
    line: z.number().int().positive(),
    baseSha: requiredString('Base SHA is required'),
    startSha: requiredString('Start SHA is required'),
    headSha: requiredString('Head SHA is required')
  }),
  projectRef: GitLabProjectRefInputSchema
})

export const GitLabResolveMrDiscussionInputSchema = GitLabRepoSelectorInputSchema.extend({
  iid: z.number().int().positive(),
  discussionId: requiredString('Discussion id is required'),
  resolved: z.boolean(),
  projectRef: GitLabProjectRefInputSchema
})

export const GitLabJobInputSchema = GitLabRepoSelectorInputSchema.extend({
  jobId: z.number().int().positive(),
  projectRef: GitLabProjectRefInputSchema
})

export const GitLabWorkItemDetailsInputSchema = GitLabRepoSelectorInputSchema.extend({
  iid: z.number().int().positive(),
  type: z.literal('mr'),
  projectRef: GitLabProjectRefInputSchema
})

export const GitLabWorkItemByPathInputSchema = GitLabRepoSelectorInputSchema.extend({
  host: requiredString('Missing GitLab host'),
  path: requiredString('Missing GitLab project path'),
  iid: z.number().int().positive(),
  type: z.literal('mr')
})

export const GitLabMrForBranchInputSchema = GitLabRepoSelectorInputSchema.extend({
  branch: requiredString('Missing branch'),
  linkedMRIid: OptionalFiniteNumber
})

export const GitLabMrInputSchema = GitLabRepoSelectorInputSchema.extend({
  iid: z.number().int().positive()
})
