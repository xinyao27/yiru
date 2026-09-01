import type {
  RepoSparsePresetRemoveInput,
  RuntimeRepoSparsePresetRemoveResult
} from '@yiru/runtime-protocol/contract'
import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import { z } from 'zod'
import {
  OptionalString,
  requiredString
} from '~main/runtime-method-contracts/runtime-method-params'
import type {
  REPO_ADD_CONTRACT,
  REPO_SEARCH_REFS_CONTRACT
} from '~main/runtime-method-contracts/workspace-contracts'

import { withRevisionConflict } from '../../../rpc/revision-conflict'
import type { RpcContext, RpcHandler } from '../core'
import { runProjectCatalogMutation } from './project-catalog-revision'
import { createRepoUpdateSchema } from './repo-update-schema'

const RepoSelector = z.object({
  repo: requiredString('Missing repo selector')
})

const RepoCreate = z.object({
  expectedRevision: z.number().int().nonnegative(),
  parentPath: requiredString('Missing parent path'),
  name: requiredString('Missing repo name'),
  kind: z.enum(['git', 'folder']).optional()
})

const RepoClone = z.object({
  expectedRevision: z.number().int().nonnegative(),
  url: requiredString('Missing clone URL'),
  destination: requiredString('Missing clone destination')
})

const RepoSetBaseRef = z.object({
  expectedRevision: z.number().int().nonnegative(),
  repo: requiredString('Missing repo selector'),
  ref: requiredString('Missing base ref')
})

const RepoUpdate = createRepoUpdateSchema({
  ...RepoSelector.shape,
  expectedRevision: z.number().int().nonnegative()
})

const RepoReorder = z.object({
  expectedRevision: z.number().int().nonnegative(),
  orderedIds: z.array(z.string())
})

const RepoRemove = RepoSelector.extend({
  expectedRevision: z.number().int().nonnegative()
})

const RepoSparsePresetSave = RepoSelector.extend({
  id: OptionalString,
  name: requiredString('Missing preset name'),
  directories: z.array(z.string())
})

type RepoSelectorInput = z.infer<typeof RepoSelector>

export function handleRepoList(_params: unknown, { runtime, workspaceEventLog }: RpcContext) {
  runtime.enrichMissingRepoGitRemoteIdentities?.()
  return {
    repos: runtime.listRepos(),
    ...(workspaceEventLog ? { revision: workspaceEventLog.revision('project-catalog') } : {})
  }
}

export const handleRepoSparsePresets = async (
  params: RepoSelectorInput,
  { runtime }: RpcContext
) => ({ presets: await runtime.listSparsePresets(params.repo) })

export const handleRepoSaveSparsePreset = (async (params, { runtime }) => ({
  preset: await runtime.saveSparsePreset(params.repo, {
    ...(params.id ? { id: params.id } : {}),
    name: params.name,
    directories: params.directories
  })
})) satisfies RpcHandler<z.infer<typeof RepoSparsePresetSave>>

export const handleRepoAdd = (async (params, { runtime, workspaceEventLog }) => {
  const add = async () => {
    const previousById = new Map(runtime.listRepos().map((repo) => [repo.id, repo]))
    const repo = await runtime.addRepo(params.path, params.kind, params.hostId)
    if (!workspaceEventLog) {
      return { repo }
    }
    const previous = previousById.get(repo.id)
    if (previous && JSON.stringify(previous) === JSON.stringify(repo)) {
      return { repo, revision: workspaceEventLog.revision('project-catalog') }
    }
    const event = workspaceEventLog.append(
      'project-catalog',
      previous ? 'project.updated' : 'project.added',
      {
        hostId: repo.executionHostId ?? 'local',
        projectId: repo.id
      }
    )
    return { repo, revision: event.revision }
  }
  return workspaceEventLog
    ? withRevisionConflict(() =>
        workspaceEventLog.runAtRevision('project-catalog', params.expectedRevision, add)
      )
    : add()
}) satisfies RpcHandler<z.infer<(typeof REPO_ADD_CONTRACT)['params']>>

export const handleRepoCreate = (
  params: z.infer<typeof RepoCreate>,
  { runtime, workspaceEventLog }: RpcContext
) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    () => runtime.createRepo(params.parentPath, params.name, params.kind),
    (result) =>
      'repo' in result ? { kind: 'project.added', payload: { projectId: result.repo.id } } : null
  )

export const handleRepoGitAvailable = async (_params: unknown, { runtime }: RpcContext) => ({
  available: await runtime.isGitAvailable()
})

export const handleRepoClone = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    async () => ({ repo: await runtime.cloneRepo(params.url, params.destination) }),
    ({ repo }) => ({ kind: 'project.added', payload: { projectId: repo.id } })
  )) satisfies RpcHandler<z.infer<typeof RepoClone>>

export const handleRepoShow = async (params: RepoSelectorInput, { runtime }: RpcContext) => ({
  repo: await runtime.showRepo(params.repo)
})

export const handleRepoUpdate = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    async () => ({
      repo: await runtime.updateRepo(
        params.repo,
        params.updates as Parameters<typeof runtime.updateRepo>[1]
      )
    }),
    ({ repo }) => ({ kind: 'project.updated', payload: { projectId: repo.id } })
  )) satisfies RpcHandler<z.infer<typeof RepoUpdate>>

export const handleRepoRemove = (
  params: z.infer<typeof RepoRemove>,
  { runtime, workspaceEventLog }: RpcContext
) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    () => runtime.removeProject(params.repo),
    () => ({ kind: 'project.removed', payload: { projectId: params.repo } })
  )

export const handleRepoReorder = (
  params: z.infer<typeof RepoReorder>,
  { runtime, workspaceEventLog }: RpcContext
) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    () => runtime.reorderRepos(params.orderedIds),
    (result) =>
      result.status === 'applied'
        ? { kind: 'project.reordered', payload: { count: params.orderedIds.length } }
        : null
  )

export const handleRepoSetBaseRef = async (
  params: z.infer<typeof RepoSetBaseRef>,
  { runtime, workspaceEventLog }: RpcContext
) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    async () => ({ repo: await runtime.setRepoBaseRef(params.repo, params.ref) }),
    ({ repo }) => ({ kind: 'project.updated', payload: { projectId: repo.id } })
  )

export const handleRepoBaseRefDefault = (
  params: RepoSelectorInput & { hostId?: ExecutionHostId },
  { runtime }: RpcContext
) => runtime.getRepoBaseRefDefault(params.repo, params.hostId)

export const handleRepoSearchRefs = ((params, { runtime }) =>
  runtime.searchRepoRefs(
    params.repo,
    params.query,
    params.limit,
    params.hostId
  )) satisfies RpcHandler<
  z.infer<(typeof REPO_SEARCH_REFS_CONTRACT)['params']> & { hostId?: ExecutionHostId }
>

export const handleRepoHooks = (params: RepoSelectorInput, { runtime }: RpcContext) =>
  runtime.getRepoHooks(params.repo)

export const handleRepoHooksCheck = (
  params: RepoSelectorInput & { hostId?: ExecutionHostId },
  { runtime }: RpcContext
) => runtime.checkRepoHooks(params.repo, params.hostId)

export const handleRepoSetupScriptImports = (params: RepoSelectorInput, { runtime }: RpcContext) =>
  runtime.inspectRepoSetupScriptImports(params.repo)

export async function handleRepoRemoveSparsePreset(
  params: RepoSparsePresetRemoveInput,
  { runtime }: RpcContext
): Promise<RuntimeRepoSparsePresetRemoveResult> {
  await runtime.removeSparsePreset(params.repo, params.presetId)
  return { removed: true }
}
