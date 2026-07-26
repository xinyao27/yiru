import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import { CoworkingExecutionError } from '../execution-error'
import type { CoworkingOwnerWorktree } from '../worktree-incarnation'
import type { CoworkingPublicWorktreeInstance } from '../worktree-publication-state'

export function pairedRuntimeEnvironmentId(target: CoworkingOwnerWorktree): string {
  const host = parseExecutionHostId(target.executionHostId)
  if (!host || host.kind !== 'runtime' || target.connectionId?.trim()) {
    throw new CoworkingExecutionError('resource_unavailable')
  }
  return host.environmentId
}

export function pairedRuntimeTargetSelector(target: CoworkingOwnerWorktree) {
  return { kind: target.kind, worktreeId: target.worktreeId, instanceId: target.instanceId }
}

export function boundPairedRuntimeTargetSelector(target: CoworkingPublicWorktreeInstance) {
  return {
    ...pairedRuntimeTargetSelector(target.ownerWorktree),
    shareEpoch: target.shareEpoch,
    coworkingIncarnationId: target.coworkingIncarnationId
  }
}
