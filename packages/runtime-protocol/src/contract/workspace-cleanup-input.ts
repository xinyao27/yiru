import { z } from 'zod'

import { OptionalString, requiredString } from './input-schema.js'

export const WorkspaceCleanupScanInputSchema = z.object({
  worktreeId: OptionalString,
  skipGitWorktreeIds: z.array(z.string()).optional(),
  scanId: OptionalString
})

export type WorkspaceCleanupScanInput = z.output<typeof WorkspaceCleanupScanInputSchema>

const WorkspaceCleanupDismissalInputSchema = z.object({
  worktreeId: requiredString('Missing worktreeId'),
  dismissedAt: z.number().finite(),
  fingerprint: requiredString('Missing fingerprint'),
  classifierVersion: z.number().finite()
})

export const WorkspaceCleanupDismissInputSchema = z.object({
  dismissals: z.array(WorkspaceCleanupDismissalInputSchema)
})

export type WorkspaceCleanupDismissInput = z.output<typeof WorkspaceCleanupDismissInputSchema>
