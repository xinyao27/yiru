import type {
  ProjectGroupCancelNestedScanInput,
  ProjectGroupCreateInput,
  ProjectGroupImportNestedInput,
  ProjectGroupMoveProjectInput,
  ProjectGroupScanNestedInput,
  ProjectGroupSelectorInput,
  ProjectGroupUpdateInput,
  RuntimeNestedRepoScanResult,
  RuntimeNullableProjectGroupResult,
  RuntimeProjectGroupCancelNestedScanResult,
  RuntimeProjectGroupDeleteResult,
  RuntimeProjectGroupImportResult,
  RuntimeProjectGroupListResult,
  RuntimeProjectGroupMoveProjectResult,
  RuntimeProjectGroupResult
} from '@yiru/runtime-protocol/contract'

import type { RpcContext, RpcHandler } from '../core'

// Why: the contract leaf has no `.input()` (there is nothing to validate for
// a parameterless list call), so oRPC infers `unknown` rather than `void` —
// direct wiring checks the handler against that real shape, unlike the
// legacy registry's erased `RpcMethod['handler']` (same class of gap as
// settings/ui's void→unknown fix, Phase 6 D-stage 切片 61).
export function handleProjectGroupList(
  _params: unknown,
  { runtime }: RpcContext
): RuntimeProjectGroupListResult {
  return { groups: runtime.listProjectGroups() }
}

export const handleProjectGroupCreate = (async (params, { runtime }) => ({
  group: await runtime.createProjectGroup(params)
})) satisfies RpcHandler<ProjectGroupCreateInput, RuntimeProjectGroupResult>

export const handleProjectGroupUpdate = (async (params, { runtime }) => ({
  group: await runtime.updateProjectGroup(params.groupId, params.updates)
})) satisfies RpcHandler<ProjectGroupUpdateInput, RuntimeNullableProjectGroupResult>

export const handleProjectGroupDelete = (async (params, { runtime }) =>
  runtime.deleteProjectGroup(params.groupId)) satisfies RpcHandler<
  ProjectGroupSelectorInput,
  RuntimeProjectGroupDeleteResult
>

export const handleProjectGroupMoveProject = (async (params, { runtime }) => ({
  repo: await runtime.moveProjectToGroup(params.repo, params.groupId ?? null, params.order)
})) satisfies RpcHandler<ProjectGroupMoveProjectInput, RuntimeProjectGroupMoveProjectResult>

export const handleProjectGroupScanNested = (async (params, { runtime }) =>
  runtime.scanNestedRepos(params.path, {
    scanId: params.scanId,
    options: params.options
  })) satisfies RpcHandler<ProjectGroupScanNestedInput, RuntimeNestedRepoScanResult>

export const handleProjectGroupCancelNestedScan = ((params, { runtime }) =>
  runtime.cancelNestedRepoScan(params.scanId)) satisfies RpcHandler<
  ProjectGroupCancelNestedScanInput,
  RuntimeProjectGroupCancelNestedScanResult
>

export const handleProjectGroupImportNested = (async (params, { runtime }) =>
  runtime.importNestedRepos(params)) satisfies RpcHandler<
  ProjectGroupImportNestedInput,
  RuntimeProjectGroupImportResult
>
