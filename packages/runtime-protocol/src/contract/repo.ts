import { type, type ContractRouter } from '@orpc/contract'
import { normalizeExecutionHostId, type ExecutionHostId } from '@yiru/workbench-model/workspace'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import { OptionalFiniteNumber, OptionalString, requiredString } from './input-schema.js'
import {
  normalizeRuntimeRepoBadgeColor,
  normalizeRuntimeRepoSourceControlAiOverrides,
  sanitizeRepoIcon
} from './repo-normalization.js'
import type {
  RuntimeRepoBaseRefDefaultResult,
  RuntimeRepoCreateResult,
  RuntimeRepoGitAvailableResult,
  RuntimeRepoHooksCheckResult,
  RuntimeRepoHooksResult,
  RuntimeRepoListResult,
  RuntimeRepoRemoveResult,
  RuntimeRepoReorderResult,
  RuntimeRepoResult,
  RuntimeRepoSearchRefsResult,
  RuntimeRepoSparsePresetResult,
  RuntimeRepoSparsePresetsResult,
  RuntimeSetupScriptImportCandidate
} from './repo-types.js'

const PROJECT_READ_ACCESS = { scope: 'project', tier: 'read' } as const
const PROJECT_CONTROL_ACCESS = { scope: 'project', tier: 'control' } as const
const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
const HOST_ACCESS = { scope: 'host', tier: 'host' } as const
const MOBILE = { mobile: true } as const

export const RepoSelectorInputSchema = z.object({
  repo: requiredString('Missing repo selector')
})

function isExecutionHostId(value: string): value is ExecutionHostId {
  return normalizeExecutionHostId(value) !== null
}

const ExecutionHostIdSchema = z.string().refine(isExecutionHostId)

// Why: a repoId can collide across execution hosts within the same store;
// hostId disambiguates which host's repo record to inspect, matching the
// preload `hooks.check` member this replaces.
export const RepoHooksCheckInputSchema = RepoSelectorInputSchema.extend({
  hostId: ExecutionHostIdSchema.optional()
})

export type RepoHooksCheckInput = z.output<typeof RepoHooksCheckInputSchema>

export const RepoPathInputSchema = z.object({
  path: requiredString('Missing repo path'),
  kind: z.enum(['git', 'folder']).optional()
})

export const RepoCreateInputSchema = z.object({
  parentPath: requiredString('Missing parent path'),
  name: requiredString('Missing repo name'),
  kind: z.enum(['git', 'folder']).optional()
})

export const RepoCloneInputSchema = z.object({
  url: requiredString('Missing clone URL'),
  destination: requiredString('Missing clone destination')
})

export const RepoSetBaseRefInputSchema = z.object({
  repo: requiredString('Missing repo selector'),
  ref: requiredString('Missing base ref')
})

export const RepoReorderInputSchema = z.object({ orderedIds: z.array(z.string()) })

// Why: a repoId can collide across execution hosts within the same store;
// hostId disambiguates which host's repo record to resolve the default base
// ref from, matching the preload `repos.getBaseRefDefault` member this replaces.
export const RepoBaseRefDefaultInputSchema = RepoSelectorInputSchema.extend({
  hostId: ExecutionHostIdSchema.optional()
})

// Why: same host-collision hazard as RepoBaseRefDefaultInputSchema — matches
// the preload `repos.searchBaseRefs`/`repos.searchBaseRefDetails` members.
export const RepoSearchRefsInputSchema = z.object({
  repo: requiredString('Missing repo selector'),
  query: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : undefined))
    .pipe(z.string({ message: 'Missing query' })),
  limit: OptionalFiniteNumber,
  hostId: ExecutionHostIdSchema.optional()
})

export const RepoSparsePresetSaveInputSchema = RepoSelectorInputSchema.extend({
  id: OptionalString,
  name: requiredString('Missing preset name'),
  directories: z.array(z.string())
})

const RepoSourceControlAiOverridesSchema = z
  .unknown()
  .optional()
  .transform((value) =>
    value === undefined
      ? undefined
      : value === null
        ? null
        : normalizeRuntimeRepoSourceControlAiOverrides(value)
  )

const RepoBadgeColorSchema = z
  .unknown()
  .optional()
  .transform((value) =>
    value === undefined ? undefined : (normalizeRuntimeRepoBadgeColor(value) ?? undefined)
  )

export const RepoUpdateInputSchema = RepoSelectorInputSchema.extend({
  updates: z.object({
    displayName: OptionalString,
    badgeColor: RepoBadgeColorSchema,
    repoIcon: z.unknown().transform(sanitizeRepoIcon).optional(),
    upstream: z
      .object({ owner: z.string().min(1), repo: z.string().min(1) })
      .nullable()
      .optional(),
    hookSettings: z.unknown().optional(),
    worktreeBaseRef: OptionalString,
    worktreeBasePath: OptionalString,
    kind: z.enum(['git', 'folder']).optional(),
    symlinkPaths: z.array(z.string()).optional(),
    forgeRemotePreference: z.enum(['auto', 'upstream', 'origin']).optional(),
    forkSyncMode: z.enum(['ask', 'safe-auto', 'off']).optional(),
    externalWorktreeVisibility: z.enum(['hide', 'show']).optional(),
    externalWorktreeVisibilityPromptDismissedAt: z.number().finite().optional(),
    externalWorktreeInboxBaselinePaths: z.array(z.string()).optional(),
    importedExternalWorktreePaths: z.array(z.string()).optional(),
    externalWorktreeDiscoverySuppressedAt: z.number().finite().nullable().optional(),
    projectGroupId: OptionalString.nullable().optional(),
    projectGroupOrder: OptionalFiniteNumber,
    sourceControlAi: RepoSourceControlAiOverridesSchema
  })
})

export type RepoSelectorInput = z.infer<typeof RepoSelectorInputSchema>
export type RepoPathInput = z.infer<typeof RepoPathInputSchema>
export type RepoCreateInput = z.infer<typeof RepoCreateInputSchema>
export type RepoCloneInput = z.infer<typeof RepoCloneInputSchema>
export type RepoSetBaseRefInput = z.infer<typeof RepoSetBaseRefInputSchema>
export type RepoReorderInput = z.infer<typeof RepoReorderInputSchema>
export type RepoBaseRefDefaultInput = z.output<typeof RepoBaseRefDefaultInputSchema>
export type RepoSearchRefsInput = z.infer<typeof RepoSearchRefsInputSchema>
export type RepoSparsePresetSaveInput = z.infer<typeof RepoSparsePresetSaveInputSchema>
export const RepoSparsePresetRemoveInputSchema = RepoSelectorInputSchema.extend({
  presetId: z.string().min(1, 'Missing presetId')
})

export type RepoSparsePresetRemoveInput = z.output<typeof RepoSparsePresetRemoveInputSchema>
export type RuntimeRepoSparsePresetRemoveResult = { removed: boolean }

export type RepoUpdateInput = z.infer<typeof RepoUpdateInputSchema>

export const repoContract = {
  list: withAccess(PROJECT_READ_ACCESS, MOBILE).output(type<RuntimeRepoListResult>()),
  sparsePresets: withAccess(PROJECT_READ_ACCESS, MOBILE)
    .input(RepoSelectorInputSchema)
    .output(type<RuntimeRepoSparsePresetsResult>()),
  saveSparsePreset: withAccess(PROJECT_CONTROL_ACCESS, MOBILE)
    .input(RepoSparsePresetSaveInputSchema)
    .output(type<RuntimeRepoSparsePresetResult>()),
  removeSparsePreset: withAccess(PROJECT_CONTROL_ACCESS, MOBILE)
    .input(RepoSparsePresetRemoveInputSchema)
    .output(type<RuntimeRepoSparsePresetRemoveResult>()),
  add: withAccess(HOST_ACCESS).input(RepoPathInputSchema).output(type<RuntimeRepoResult>()),
  create: withAccess(HOST_ACCESS)
    .input(RepoCreateInputSchema)
    .output(type<RuntimeRepoCreateResult>()),
  gitAvailable: withAccess(HOST_READ_ACCESS, MOBILE).output(type<RuntimeRepoGitAvailableResult>()),
  clone: withAccess(HOST_ACCESS).input(RepoCloneInputSchema).output(type<RuntimeRepoResult>()),
  show: withAccess(PROJECT_READ_ACCESS)
    .input(RepoSelectorInputSchema)
    .output(type<RuntimeRepoResult>()),
  update: withAccess(PROJECT_CONTROL_ACCESS, MOBILE)
    .input(RepoUpdateInputSchema)
    .output(type<RuntimeRepoResult>()),
  rm: withAccess(HOST_ACCESS)
    .input(RepoSelectorInputSchema)
    .output(type<RuntimeRepoRemoveResult>()),
  reorder: withAccess(PROJECT_CONTROL_ACCESS)
    .input(RepoReorderInputSchema)
    .output(type<RuntimeRepoReorderResult>()),
  setBaseRef: withAccess(PROJECT_CONTROL_ACCESS)
    .input(RepoSetBaseRefInputSchema)
    .output(type<RuntimeRepoResult>()),
  baseRefDefault: withAccess(PROJECT_READ_ACCESS, MOBILE)
    .input(RepoBaseRefDefaultInputSchema)
    .output(type<RuntimeRepoBaseRefDefaultResult>()),
  searchRefs: withAccess(PROJECT_READ_ACCESS, MOBILE)
    .input(RepoSearchRefsInputSchema)
    .output(type<RuntimeRepoSearchRefsResult>()),
  hooks: withAccess(PROJECT_READ_ACCESS, MOBILE)
    .input(RepoSelectorInputSchema)
    .output(type<RuntimeRepoHooksResult>()),
  hooksCheck: withAccess(PROJECT_READ_ACCESS)
    .input(RepoHooksCheckInputSchema)
    .output(type<RuntimeRepoHooksCheckResult>()),
  setupScriptImports: withAccess(PROJECT_READ_ACCESS)
    .input(RepoSelectorInputSchema)
    .output(type<RuntimeSetupScriptImportCandidate[]>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export type {
  RuntimeRepo,
  RuntimeRepoBaseRefDefaultResult,
  RuntimeRepoCreateResult,
  RuntimeRepoGitAvailableResult,
  RuntimeRepoHookSettings,
  RuntimeRepoHooksCheckResult,
  RuntimeRepoHooksResult,
  RuntimeRepoListResult,
  RuntimeRepoRemoveResult,
  RuntimeRepoReorderResult,
  RuntimeRepoResult,
  RuntimeRepoSearchRefsResult,
  RuntimeRepoSourceControlAiOverrides,
  RuntimeRepoSparsePresetResult,
  RuntimeRepoSparsePresetsResult,
  RuntimeSetupScriptImportCandidate,
  RuntimeSparsePreset,
  RuntimeYiruHooks
} from './repo-types.js'
