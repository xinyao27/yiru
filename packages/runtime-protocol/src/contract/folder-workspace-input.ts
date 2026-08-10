import { z } from 'zod'

import {
  isRuntimeTuiAgent,
  OptionalFiniteNumber,
  OptionalString,
  requiredString
} from './input-schema.js'

const FolderWorkspaceLinkedReviewSchema = z
  .object({
    provider: z.enum(['github', 'gitlab']),
    type: z.enum(['pr', 'mr']),
    number: z.number().finite(),
    title: requiredString('Missing linked review title'),
    url: requiredString('Missing linked review URL'),
    repoId: OptionalString
  })
  .nullable()

export const FolderWorkspaceCreateInputSchema = z.object({
  projectGroupId: requiredString('Missing project group id'),
  name: OptionalString,
  folderPath: OptionalString.nullable().optional(),
  connectionId: OptionalString.nullable().optional(),
  linkedReview: FolderWorkspaceLinkedReviewSchema.optional(),
  createdWithAgent: z.string().refine(isRuntimeTuiAgent).optional(),
  pendingFirstAgentMessageRename: z.boolean().optional()
})

export const FolderWorkspaceUpdateInputSchema = z.object({
  folderWorkspaceId: requiredString('Missing folder workspace id'),
  updates: z.object({
    name: OptionalString,
    folderPath: OptionalString,
    linkedReview: FolderWorkspaceLinkedReviewSchema.optional(),
    comment: z.string().optional(),
    isArchived: z.boolean().optional(),
    isUnread: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    sortOrder: OptionalFiniteNumber,
    manualOrder: OptionalFiniteNumber,
    workspaceStatus: OptionalString,
    createdWithAgent: z.string().refine(isRuntimeTuiAgent).optional(),
    pendingFirstAgentMessageRename: z.boolean().optional(),
    firstAgentMessageRenameError: z.string().nullable().optional(),
    lastActivityAt: OptionalFiniteNumber
  })
})

export const FolderWorkspaceSelectorInputSchema = z.object({
  folderWorkspaceId: requiredString('Missing folder workspace id')
})

export const FolderWorkspacePathStatusInputSchema = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('folder-workspace'),
    folderWorkspaceId: requiredString('Missing folder workspace id')
  }),
  z.object({
    scope: z.literal('project-group'),
    projectGroupId: requiredString('Missing project group id')
  }),
  z.object({
    scope: z.literal('path'),
    path: requiredString('Missing folder path')
  })
])

export type FolderWorkspaceCreateInput = z.output<typeof FolderWorkspaceCreateInputSchema>
export type FolderWorkspaceUpdateInput = z.output<typeof FolderWorkspaceUpdateInputSchema>
export type FolderWorkspaceSelectorInput = z.output<typeof FolderWorkspaceSelectorInputSchema>
export type FolderWorkspacePathStatusInput = z.output<typeof FolderWorkspacePathStatusInputSchema>
