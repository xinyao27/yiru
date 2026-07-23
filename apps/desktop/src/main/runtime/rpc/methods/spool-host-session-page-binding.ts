import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import type { SpoolPairedRuntimeResolvedWorktree } from '../../../../shared/spool/spool-paired-runtime-host-contract'
import type { SpoolPairedRuntimeSessionWorktree } from '../../../../shared/spool/spool-paired-runtime-session-contract'
import type { SpoolHistoricalSessionPurpose } from '../../../spool/spool-session-source'
import type { RpcContext } from '../core'

export type SpoolHostSessionPageReleaseBinding = Readonly<{
  physicalConnectionId: string
  worktreeId: string
  worktreeInstanceId: string
  spoolIncarnationId: string
  purpose: SpoolHistoricalSessionPurpose
  inventoryScope: string
}>

export type SpoolHostSessionPageBinding = SpoolHostSessionPageReleaseBinding &
  Readonly<{
    executionHostId: ExecutionHostId
    worktreePath: string
  }>

export function encodeSpoolHostSessionPageBinding(binding: SpoolHostSessionPageBinding): string {
  // Why: reconnect, retarget, incarnation, purpose, or host changes must invalidate old cursors.
  return JSON.stringify([
    binding.physicalConnectionId,
    binding.worktreeId,
    binding.worktreeInstanceId,
    binding.spoolIncarnationId,
    binding.purpose,
    binding.inventoryScope,
    binding.executionHostId,
    binding.worktreePath
  ])
}

export function encodeSpoolHostSessionPageReleaseBinding(
  binding: SpoolHostSessionPageReleaseBinding
): string {
  return JSON.stringify([
    binding.physicalConnectionId,
    binding.worktreeId,
    binding.worktreeInstanceId,
    binding.spoolIncarnationId,
    binding.purpose,
    binding.inventoryScope
  ])
}

export function spoolHostSessionPageConnectionCleanupId(connectionId: string): string {
  return `spool.host.session-pages:${connectionId}`
}

export function spoolHostSessionPageBinding(
  context: RpcContext,
  params: SessionPageBindingParams,
  worktree: SpoolPairedRuntimeResolvedWorktree
): SpoolHostSessionPageBinding {
  return {
    ...spoolHostSessionPageReleaseBinding(context, params),
    executionHostId: worktree.executionHostId,
    worktreePath: worktree.worktreePath
  }
}

export function spoolHostSessionPageReleaseBinding(
  context: RpcContext,
  params: SessionPageBindingParams
): SpoolHostSessionPageReleaseBinding {
  return {
    physicalConnectionId: requireSessionPageConnection(context),
    worktreeId: params.target.worktreeId,
    worktreeInstanceId: params.target.instanceId,
    spoolIncarnationId: params.target.spoolIncarnationId,
    purpose: params.purpose,
    inventoryScope: params.inventoryScope
  }
}

type SessionPageBindingParams = {
  target: SpoolPairedRuntimeSessionWorktree
  purpose: SpoolHistoricalSessionPurpose
  inventoryScope: string
}

function requireSessionPageConnection(context: RpcContext): string {
  if (!context.connectionId) {
    throw new Error('paired_runtime_session_connection_required')
  }
  return context.connectionId
}
