import { z } from 'zod'

export type RuntimeWorktreeArchive = {
  branch: string
  createdAt: number
  failureDetail: string | null
  head: string
  id: string
  originalWorktreeId: string
  path: string
  repoId: string
  restoredAt: number | null
  stashOid: string | null
  status: 'archiving' | 'archived' | 'failed' | 'restored'
}

export const WorktreeArchiveInputSchema = z.object({
  deleteBranch: z.boolean().optional(),
  expectedRevision: z.number().int().nonnegative(),
  worktree: z.string().trim().min(1)
})

export const WorktreeArchiveListInputSchema = z.object({
  repo: z.string().trim().min(1).optional()
})

export const WorktreeArchiveRestoreInputSchema = z.object({
  archiveId: z.string().trim().min(1),
  expectedRevision: z.number().int().nonnegative()
})

export type WorktreeArchiveInput = z.infer<typeof WorktreeArchiveInputSchema>
export type WorktreeArchiveListInput = z.infer<typeof WorktreeArchiveListInputSchema>
export type WorktreeArchiveRestoreInput = z.infer<typeof WorktreeArchiveRestoreInputSchema>
