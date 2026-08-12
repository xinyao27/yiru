import { z } from 'zod'

export const MOBILE_WORKTREE_PS_ORPC_PATH = '/worktree/ps'

export const MobileWorkspaceListRequestSchema = z.object({
  limit: z.number().int().positive().optional()
})

// Why: native clients need a small, backwards-compatible projection of the much
// larger sidebar snapshot. Unknown additive fields are intentionally stripped.
export const MobileWorkspaceListItemSchema = z.object({
  worktreeId: z.string(),
  repo: z.string(),
  path: z.string(),
  branch: z.string(),
  displayName: z.string(),
  workspaceStatus: z.string(),
  isArchived: z.boolean(),
  isMainWorktree: z.boolean().optional(),
  isPinned: z.boolean(),
  isActive: z.boolean(),
  unread: z.boolean(),
  liveTerminalCount: z.number().int().nonnegative(),
  lastActivityAt: z.number().int().optional(),
  lastOutputAt: z.number().int().nullable(),
  preview: z.string(),
  status: z.enum(['active', 'working', 'permission', 'done', 'inactive'])
})

export const MobileWorkspaceListSchema = z.object({
  worktrees: z.array(MobileWorkspaceListItemSchema),
  totalCount: z.number().int().nonnegative(),
  truncated: z.boolean()
})

export type MobileWorkspaceListItem = z.infer<typeof MobileWorkspaceListItemSchema>
export type MobileWorkspaceList = z.infer<typeof MobileWorkspaceListSchema>
export type MobileWorkspaceListRequest = z.infer<typeof MobileWorkspaceListRequestSchema>
