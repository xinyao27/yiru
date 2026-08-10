import { normalizeExecutionHostId } from '@yiru/workbench-model/workspace'
import { z } from 'zod'

import { OptionalString, requiredString } from './input-schema.js'

const ProjectExecutionHostIdSchema = requiredString('Missing host ID').transform(
  (value, context) => {
    const hostId = normalizeExecutionHostId(value)
    if (!hostId) {
      context.addIssue({ code: 'custom', message: 'Invalid host ID' })
      return z.NEVER
    }
    return hostId
  }
)

const LocalWindowsRuntimePreferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inherit-global') }),
  z.object({ kind: z.literal('windows-host') }),
  z.object({ kind: z.literal('wsl'), distro: requiredString('Missing WSL distro') })
])

export const ProjectUpdateInputSchema = z.object({
  projectId: requiredString('Missing project ID'),
  updates: z.object({
    localWindowsRuntimePreference: LocalWindowsRuntimePreferenceSchema.optional()
  })
})

export const ProjectHostSetupExistingFolderInputSchema = z.object({
  projectId: requiredString('Missing project ID'),
  hostId: ProjectExecutionHostIdSchema,
  path: requiredString('Missing project path'),
  kind: z.enum(['git', 'folder']).optional(),
  displayName: OptionalString,
  setupMethod: z.enum(['imported-existing-folder', 'cloned']).optional()
})

export const ProjectHostSetupCloneInputSchema = z.object({
  projectId: requiredString('Missing project ID'),
  hostId: ProjectExecutionHostIdSchema,
  url: requiredString('Missing clone URL'),
  destination: requiredString('Missing clone destination'),
  displayName: OptionalString
})

export const ProjectHostSetupCreateInputSchema = z.object({
  projectId: requiredString('Missing project ID'),
  hostId: ProjectExecutionHostIdSchema,
  setupId: OptionalString,
  path: OptionalString,
  kind: z.enum(['git', 'folder']).optional(),
  displayName: OptionalString,
  worktreeBasePath: OptionalString,
  gitUsername: OptionalString,
  setupState: z.enum(['ready', 'not-set-up', 'setting-up', 'error', 'unsupported']).optional(),
  setupMethod: z.enum(['imported-existing-folder', 'cloned', 'provisioned']).optional()
})

export const ProjectHostSetupUpdateInputSchema = z.object({
  setupId: requiredString('Missing setup ID'),
  updates: z.object({
    displayName: OptionalString,
    path: OptionalString,
    worktreeBasePath: OptionalString,
    setupState: z.enum(['ready', 'not-set-up', 'setting-up', 'error', 'unsupported']).optional(),
    setupMethod: z
      .enum(['legacy-repo', 'imported-existing-folder', 'cloned', 'provisioned'])
      .optional(),
    gitUsername: OptionalString,
    kind: z.enum(['git', 'folder']).optional()
  })
})

export const ProjectHostSetupDeleteInputSchema = z.object({
  setupId: requiredString('Missing setup ID')
})

export type ProjectUpdateInput = z.output<typeof ProjectUpdateInputSchema>
export type ProjectHostSetupExistingFolderInput = z.output<
  typeof ProjectHostSetupExistingFolderInputSchema
>
export type ProjectHostSetupCloneInput = z.output<typeof ProjectHostSetupCloneInputSchema>
export type ProjectHostSetupCreateInput = z.output<typeof ProjectHostSetupCreateInputSchema>
export type ProjectHostSetupUpdateInput = z.output<typeof ProjectHostSetupUpdateInputSchema>
export type ProjectHostSetupDeleteInput = z.output<typeof ProjectHostSetupDeleteInputSchema>
