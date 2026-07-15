import { parseExecutionHostId } from '../../shared/execution-host'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

export function pairedRuntimeEnvironmentId(target: SpoolOwnerWorktree): string {
  const host = parseExecutionHostId(target.executionHostId)
  if (!host || host.kind !== 'runtime' || target.connectionId?.trim()) {
    throw new SpoolExecutionError('resource_unavailable')
  }
  return host.environmentId
}

export function pairedRuntimeTargetSelector(target: SpoolOwnerWorktree) {
  return { kind: target.kind, worktreeId: target.worktreeId, instanceId: target.instanceId }
}

export function boundPairedRuntimeTargetSelector(target: SpoolPublicWorktreeInstance) {
  return {
    ...pairedRuntimeTargetSelector(target.target),
    shareEpoch: target.shareEpoch,
    spoolIncarnationId: target.spoolIncarnationId
  }
}
