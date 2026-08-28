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
import { runProjectCatalogMutation } from './project-catalog-revision'

// Why: the contract leaf has no `.input()` (there is nothing to validate for
// a parameterless list call), so oRPC infers `unknown` rather than `void` —
// direct wiring checks the handler against that real shape, unlike the
// legacy registry's erased `RpcMethod['handler']` (same class of gap as
// settings/ui's void→unknown fix, Phase 6 D-stage 切片 61).
export function handleProjectGroupList(
  _params: unknown,
  { runtime, workspaceEventLog }: RpcContext
): RuntimeProjectGroupListResult {
  return {
    groups: runtime.listProjectGroups(),
    ...(workspaceEventLog ? { revision: workspaceEventLog.revision('project-catalog') } : {})
  }
}

export const handleProjectGroupCreate = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    async () => ({ group: await runtime.createProjectGroup(params) }),
    ({ group }) => ({ kind: 'project-group.created', payload: { groupId: group.id } })
  )) satisfies RpcHandler<ProjectGroupCreateInput, RuntimeProjectGroupResult>

export const handleProjectGroupUpdate = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    async () => ({ group: await runtime.updateProjectGroup(params.groupId, params.updates) }),
    ({ group }) =>
      group ? { kind: 'project-group.updated', payload: { groupId: group.id } } : null
  )) satisfies RpcHandler<ProjectGroupUpdateInput, RuntimeNullableProjectGroupResult>

export const handleProjectGroupDelete = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    () => runtime.deleteProjectGroup(params.groupId),
    ({ deleted }) =>
      deleted ? { kind: 'project-group.deleted', payload: { groupId: params.groupId } } : null
  )) satisfies RpcHandler<ProjectGroupSelectorInput, RuntimeProjectGroupDeleteResult>

export const handleProjectGroupMoveProject = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    async () => ({
      repo: await runtime.moveProjectToGroup(params.repo, params.groupId ?? null, params.order)
    }),
    ({ repo }) => ({
      kind: 'project.moved-to-group',
      payload: { groupId: params.groupId ?? null, projectId: repo.id }
    })
  )) satisfies RpcHandler<ProjectGroupMoveProjectInput, RuntimeProjectGroupMoveProjectResult>

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

export const handleProjectGroupImportNested = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    () => runtime.importNestedRepos(params),
    (result) =>
      result.group || result.importedCount > 0
        ? {
            kind: 'project.nested-imported',
            payload: {
              importedCount: result.importedCount,
              mode: params.mode
            }
          }
        : null
  )) satisfies RpcHandler<ProjectGroupImportNestedInput, RuntimeProjectGroupImportResult>
