import { z } from 'zod'

import { OptionalFiniteNumber, OptionalString, requiredString } from './input-schema.js'

export const ProjectGroupCreateInputSchema = z.object({
  name: requiredString('Missing group name'),
  parentPath: OptionalString,
  connectionId: OptionalString.nullable().optional(),
  parentGroupId: OptionalString.nullable().optional(),
  createdFrom: z.enum(['manual', 'folder-scan', 'migration']).optional()
})

export const ProjectGroupUpdateInputSchema = z.object({
  groupId: requiredString('Missing group id'),
  updates: z.object({
    name: OptionalString,
    isCollapsed: z.boolean().optional(),
    tabOrder: OptionalFiniteNumber,
    color: OptionalString.nullable().optional()
  })
})

export const ProjectGroupSelectorInputSchema = z.object({
  groupId: requiredString('Missing group id')
})

export const ProjectGroupMoveProjectInputSchema = z.object({
  repo: requiredString('Missing repo selector'),
  groupId: OptionalString.nullable(),
  order: OptionalFiniteNumber
})

export const ProjectGroupScanNestedInputSchema = z.object({
  path: requiredString('Missing folder path'),
  // Why: correlates progress ticks (projectGroup.events.subscribe) and a
  // later cancelNestedScan/importNested call back to this scan.
  scanId: OptionalString,
  options: z.unknown().optional()
})

export const ProjectGroupCancelNestedScanInputSchema = z.object({
  scanId: requiredString('Missing scan id')
})

export const ProjectGroupImportNestedInputSchema = z.discriminatedUnion('mode', [
  z.object({
    parentPath: requiredString('Missing parent path'),
    groupName: z.string().optional().default(''),
    projectPaths: z.array(z.string()),
    // Why: reuses the scanNested result instead of rescanning when the
    // caller already has one (matches the preload `importNested` member).
    scanId: OptionalString,
    mode: z.literal('group')
  }),
  z.object({
    parentPath: requiredString('Missing parent path'),
    // Why: separate imports do not create a group but retain the renderer's
    // shared payload shape, including its blank-name fallback field.
    groupName: z.string().optional().default(''),
    projectPaths: z.array(z.string()),
    scanId: OptionalString,
    mode: z.literal('separate')
  })
])

export type ProjectGroupCreateInput = z.output<typeof ProjectGroupCreateInputSchema>
export type ProjectGroupUpdateInput = z.output<typeof ProjectGroupUpdateInputSchema>
export type ProjectGroupSelectorInput = z.output<typeof ProjectGroupSelectorInputSchema>
export type ProjectGroupMoveProjectInput = z.output<typeof ProjectGroupMoveProjectInputSchema>
export type ProjectGroupScanNestedInput = z.output<typeof ProjectGroupScanNestedInputSchema>
export type ProjectGroupCancelNestedScanInput = z.output<
  typeof ProjectGroupCancelNestedScanInputSchema
>
export type ProjectGroupImportNestedInput = z.output<typeof ProjectGroupImportNestedInputSchema>
