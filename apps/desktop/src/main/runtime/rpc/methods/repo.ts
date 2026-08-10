import type {
  RepoSparsePresetRemoveInput,
  RuntimeRepoSparsePresetRemoveResult
} from '@yiru/runtime-protocol/contract'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import { z } from 'zod'
import {
  OptionalString,
  requiredString
} from '~shared/runtime-method-contracts/runtime-method-params'
import type {
  REPO_ADD_CONTRACT,
  REPO_SEARCH_REFS_CONTRACT
} from '~shared/runtime-method-contracts/workspace-contracts'

import type { RpcContext, RpcHandler } from '../core'
import { createRepoUpdateSchema } from './repo-update-schema'

const RepoSelector = z.object({
  repo: requiredString('Missing repo selector')
})

const RepoCreate = z.object({
  parentPath: requiredString('Missing parent path'),
  name: requiredString('Missing repo name'),
  kind: z.enum(['git', 'folder']).optional()
})

const RepoClone = z.object({
  url: requiredString('Missing clone URL'),
  destination: requiredString('Missing clone destination')
})

const RepoSetBaseRef = z.object({
  repo: requiredString('Missing repo selector'),
  ref: requiredString('Missing base ref')
})

const RepoUpdate = createRepoUpdateSchema(RepoSelector.shape)

const RepoReorder = z.object({
  orderedIds: z.array(z.string())
})

const RepoSparsePresetSave = RepoSelector.extend({
  id: OptionalString,
  name: requiredString('Missing preset name'),
  directories: z.array(z.string())
})

type RepoSelectorInput = z.infer<typeof RepoSelector>

export function handleRepoList(_params: unknown, { runtime }: RpcContext) {
  runtime.enrichMissingRepoGitRemoteIdentities?.()
  return { repos: runtime.listRepos() }
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

export const handleRepoAdd = (async (params, { runtime }) => ({
  repo: await runtime.addRepo(params.path, params.kind)
})) satisfies RpcHandler<z.infer<(typeof REPO_ADD_CONTRACT)['params']>>

export const handleRepoCreate = (params: z.infer<typeof RepoCreate>, { runtime }: RpcContext) =>
  runtime.createRepo(params.parentPath, params.name, params.kind)

export const handleRepoGitAvailable = async (_params: unknown, { runtime }: RpcContext) => ({
  available: await runtime.isGitAvailable()
})

export const handleRepoClone = (async (params, { runtime }) => ({
  repo: await runtime.cloneRepo(params.url, params.destination)
})) satisfies RpcHandler<z.infer<typeof RepoClone>>

export const handleRepoShow = async (params: RepoSelectorInput, { runtime }: RpcContext) => ({
  repo: await runtime.showRepo(params.repo)
})

export const handleRepoUpdate = (async (params, { runtime }) => ({
  repo: await runtime.updateRepo(
    params.repo,
    params.updates as Parameters<typeof runtime.updateRepo>[1]
  )
})) satisfies RpcHandler<z.infer<typeof RepoUpdate>>

export const handleRepoRemove = (params: RepoSelectorInput, { runtime }: RpcContext) =>
  runtime.removeProject(params.repo)

export const handleRepoReorder = (params: z.infer<typeof RepoReorder>, { runtime }: RpcContext) =>
  runtime.reorderRepos(params.orderedIds)

export const handleRepoSetBaseRef = async (
  params: z.infer<typeof RepoSetBaseRef>,
  { runtime }: RpcContext
) => ({ repo: await runtime.setRepoBaseRef(params.repo, params.ref) })

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
