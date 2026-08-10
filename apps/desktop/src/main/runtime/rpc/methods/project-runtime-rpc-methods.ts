import type {
  ProjectHostSetupCloneInput,
  ProjectHostSetupCreateInput,
  ProjectHostSetupDeleteInput,
  ProjectHostSetupExistingFolderInput,
  ProjectHostSetupUpdateInput,
  ProjectUpdateInput,
  RuntimeProjectHostSetupCreateResultEnvelope,
  RuntimeProjectHostSetupDeleteResultEnvelope,
  RuntimeProjectHostSetupListResult,
  RuntimeProjectHostSetupResultEnvelope,
  RuntimeProjectHostSetupUpdateResultEnvelope,
  RuntimeProjectListResult,
  RuntimeProjectResult
} from '@yiru/runtime-protocol/contract'

import type { RpcContext, RpcHandler } from '../core'

// Why: the contract leaf has no `.input()`, so oRPC infers `unknown` rather
// than `void` — direct wiring checks the handler against that real shape
// (same class of gap as settings/ui's void→unknown fix, Phase 6 D-stage
// 切片 61, and this file's own `projectHostSetup.list` fix below).
export function handleProjectList(
  _params: unknown,
  { runtime }: RpcContext
): RuntimeProjectListResult {
  runtime.enrichMissingRepoGitRemoteIdentities?.()
  return { projects: runtime.listProjects() }
}

export const handleProjectUpdate = ((params, { runtime }) => ({
  project: runtime.updateProject(params.projectId, params.updates)
})) satisfies RpcHandler<ProjectUpdateInput, RuntimeProjectResult>

// Why: the contract leaf has no `.input()`, so oRPC infers `unknown` rather
// than `void` — direct wiring checks the handler against that real shape,
// unlike the legacy registry's erased `RpcMethod['handler']` (same class of
// gap as settings/ui's void→unknown fix, Phase 6 D-stage 切片 61).
export function handleProjectHostSetupList(
  _params: unknown,
  { runtime }: RpcContext
): RuntimeProjectHostSetupListResult {
  runtime.enrichMissingRepoGitRemoteIdentities?.()
  return { setups: runtime.listProjectHostSetups() }
}

export const handleProjectHostSetupCreate = ((params, { runtime }) => ({
  result: runtime.createProjectHostSetup(params)
})) satisfies RpcHandler<ProjectHostSetupCreateInput, RuntimeProjectHostSetupCreateResultEnvelope>

export const handleProjectHostSetupExistingFolder = (async (params, { runtime }) => ({
  result: await runtime.setupProjectExistingFolder(params)
})) satisfies RpcHandler<ProjectHostSetupExistingFolderInput, RuntimeProjectHostSetupResultEnvelope>

export const handleProjectHostSetupClone = (async (params, { runtime }) => ({
  result: await runtime.setupProjectClone(params)
})) satisfies RpcHandler<ProjectHostSetupCloneInput, RuntimeProjectHostSetupResultEnvelope>

export const handleProjectHostSetupUpdate = ((params, { runtime }) => ({
  result: runtime.updateProjectHostSetup(params)
})) satisfies RpcHandler<ProjectHostSetupUpdateInput, RuntimeProjectHostSetupUpdateResultEnvelope>

export const handleProjectHostSetupDelete = ((params, { runtime }) => ({
  result: runtime.deleteProjectHostSetup(params)
})) satisfies RpcHandler<ProjectHostSetupDeleteInput, RuntimeProjectHostSetupDeleteResultEnvelope>

// Why: `project` and `projectHostSetup` are both Phase 6 D-stage direct-wired
// domains now (orpc/router-direct.ts via `wireRuntimeMethod`) — they only
// ever shared this file for historical reasons, not because they're one
// domain.
