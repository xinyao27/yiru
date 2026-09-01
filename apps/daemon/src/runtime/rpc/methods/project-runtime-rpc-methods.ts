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
import { runProjectCatalogMutation } from './project-catalog-revision'

// Why: the contract leaf has no `.input()`, so oRPC infers `unknown` rather
// than `void` — direct wiring checks the handler against that real shape
// (same class of gap as settings/ui's void→unknown fix, Phase 6 D-stage
// 切片 61, and this file's own `projectHostSetup.list` fix below).
export function handleProjectList(
  _params: unknown,
  { runtime, workspaceEventLog }: RpcContext
): RuntimeProjectListResult {
  runtime.enrichMissingRepoGitRemoteIdentities?.()
  return {
    projects: runtime.listProjects(),
    ...(workspaceEventLog ? { revision: workspaceEventLog.revision('project-catalog') } : {})
  }
}

export const handleProjectUpdate = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    () => ({ project: runtime.updateProject(params.projectId, params.updates) }),
    ({ project }) => ({ kind: 'project.updated', payload: { projectId: project.id } })
  )) satisfies RpcHandler<ProjectUpdateInput, RuntimeProjectResult>

// Why: the contract leaf has no `.input()`, so oRPC infers `unknown` rather
// than `void` — direct wiring checks the handler against that real shape,
// unlike the legacy registry's erased `RpcMethod['handler']` (same class of
// gap as settings/ui's void→unknown fix, Phase 6 D-stage 切片 61).
export function handleProjectHostSetupList(
  _params: unknown,
  { runtime, workspaceEventLog }: RpcContext
): RuntimeProjectHostSetupListResult {
  runtime.enrichMissingRepoGitRemoteIdentities?.()
  return {
    setups: runtime.listProjectHostSetups(),
    ...(workspaceEventLog ? { revision: workspaceEventLog.revision('project-catalog') } : {})
  }
}

export const handleProjectHostSetupCreate = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    () => ({ result: runtime.createProjectHostSetup(params) }),
    ({ result }) => ({
      kind: 'project-host-setup.created',
      payload: { projectId: result.project.id, setupId: result.setup.id }
    })
  )) satisfies RpcHandler<ProjectHostSetupCreateInput, RuntimeProjectHostSetupCreateResultEnvelope>

export const handleProjectHostSetupExistingFolder = (async (
  params,
  { runtime, workspaceEventLog }
) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    async () => ({ result: await runtime.setupProjectExistingFolder(params) }),
    ({ result }) => ({
      kind: 'project-host-setup.existing-folder-configured',
      payload: { projectId: result.project.id, setupId: result.setup.id }
    })
  )) satisfies RpcHandler<
  ProjectHostSetupExistingFolderInput,
  RuntimeProjectHostSetupResultEnvelope
>

export const handleProjectHostSetupClone = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    async () => ({ result: await runtime.setupProjectClone(params) }),
    ({ result }) => ({
      kind: 'project-host-setup.cloned',
      payload: { projectId: result.project.id, setupId: result.setup.id }
    })
  )) satisfies RpcHandler<ProjectHostSetupCloneInput, RuntimeProjectHostSetupResultEnvelope>

export const handleProjectHostSetupUpdate = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    () => ({ result: runtime.updateProjectHostSetup(params) }),
    ({ result }) => ({
      kind: 'project-host-setup.updated',
      payload: { projectId: result.project.id, setupId: result.setup.id }
    })
  )) satisfies RpcHandler<ProjectHostSetupUpdateInput, RuntimeProjectHostSetupUpdateResultEnvelope>

export const handleProjectHostSetupDelete = (async (params, { runtime, workspaceEventLog }) =>
  runProjectCatalogMutation(
    workspaceEventLog,
    params.expectedRevision,
    () => ({ result: runtime.deleteProjectHostSetup(params) }),
    ({ result }) => ({
      kind: 'project-host-setup.deleted',
      payload: { projectId: result.project.id, setupId: result.setup.id }
    })
  )) satisfies RpcHandler<ProjectHostSetupDeleteInput, RuntimeProjectHostSetupDeleteResultEnvelope>

// Why: `project` and `projectHostSetup` are both Phase 6 D-stage direct-wired
// domains now (orpc/router-direct.ts via `wireRuntimeMethod`) — they only
// ever shared this file for historical reasons, not because they're one
// domain.
