import type { DiffComment, MobileDiffReviewState } from '@yiru/workbench-model/workspace'
import { z } from 'zod'

export const MOBILE_REVIEW_METADATA_GET_ORPC_PATH = '/worktree/show'
export const MOBILE_REVIEW_METADATA_SET_ORPC_PATH = '/worktree/set'
export const MOBILE_REVIEW_TERMINAL_SEND_ORPC_PATH = '/terminal/send'
export const MOBILE_REVIEW_FILE_OPEN_DIFF_ORPC_PATH = '/files/openDiff'

export const MobileReviewScopeSchema = z.enum(['unstaged', 'staged', 'branch'])
export const MobileReviewCommentSchema = z.object({
  id: z.string(),
  worktreeId: z.string(),
  filePath: z.string(),
  source: z.enum(['diff', 'markdown']).optional(),
  selectedText: z.string().optional(),
  startLine: z.number().int().optional(),
  lineNumber: z.number().int(),
  body: z.string(),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
  sentAt: z.number().optional(),
  scope: MobileReviewScopeSchema.optional(),
  oldPath: z.string().optional(),
  diffIdentity: z.string().optional(),
  side: z.literal('modified')
})
export const MobileReviewFileStateSchema = z.object({
  key: z.string(),
  filePath: z.string(),
  oldPath: z.string().optional(),
  scope: MobileReviewScopeSchema,
  lastOpenedAt: z.number().optional(),
  lastSeenDiffIdentity: z.string().optional(),
  reviewedAt: z.number().optional(),
  reviewDiffIdentity: z.string().optional()
})
export const MobileReviewStateSchema = z.object({
  version: z.literal(1),
  updatedAt: z.number().optional(),
  completedAt: z.number().optional(),
  files: z.record(z.string(), MobileReviewFileStateSchema)
})
export const MobileReviewMetadataRequestSchema = z.object({ worktree: z.string().min(1) })
export const MobileReviewMetadataResultSchema = z.object({
  worktree: z.object({
    diffComments: z.array(MobileReviewCommentSchema).optional(),
    mobileDiffReview: MobileReviewStateSchema.optional()
  })
})
export const MobileReviewMetadataSetRequestSchema = MobileReviewMetadataRequestSchema.extend({
  diffComments: z.array(MobileReviewCommentSchema),
  mobileDiffReview: MobileReviewStateSchema
})
export const MobileReviewTerminalSendRequestSchema = z.object({
  terminal: z.string().min(1),
  text: z.string(),
  enter: z.boolean()
})
export const MobileReviewFileOpenDiffRequestSchema = z.object({
  worktree: z.string().min(1),
  relativePath: z.string().min(1),
  staged: z.boolean()
})
export const MobileReviewTerminalSendResultSchema = z.object({
  send: z.object({
    handle: z.string(),
    accepted: z.boolean(),
    bytesWritten: z.number(),
    refusedReason: z.enum(['no-agent', 'permission']).optional()
  })
})

export const MOBILE_REVIEW_COMMENT_WIRE_IS_COMPATIBLE: DiffComment extends z.infer<
  typeof MobileReviewCommentSchema
>
  ? true
  : false = true
export const MOBILE_REVIEW_STATE_WIRE_IS_COMPATIBLE: MobileDiffReviewState extends z.infer<
  typeof MobileReviewStateSchema
>
  ? true
  : false = true
