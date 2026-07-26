import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import type { CoworkingPairedRuntimeResolvedWorktree } from '../../../../shared/coworking/paired-runtime-host-contract'
import type { CoworkingPairedRuntimeSessionWorktree } from '../../../../shared/coworking/paired-runtime-session-contract'
import type { CoworkingHistoricalSessionPurpose } from '../../../coworking/session/source'
import type { RpcContext } from '../core'

export type CoworkingHostSessionPageReleaseBinding = Readonly<{
  physicalConnectionId: string
  worktreeId: string
  worktreeInstanceId: string
  coworkingIncarnationId: string
  purpose: CoworkingHistoricalSessionPurpose
  inventoryScope: string
}>

export type CoworkingHostSessionPageBinding = CoworkingHostSessionPageReleaseBinding &
  Readonly<{
    executionHostId: ExecutionHostId
    worktreePath: string
  }>

export function encodeCoworkingHostSessionPageBinding(
  binding: CoworkingHostSessionPageBinding
): string {
  // Why: reconnect, retarget, incarnation, purpose, or host changes must invalidate old cursors.
  return JSON.stringify([
    binding.physicalConnectionId,
    binding.worktreeId,
    binding.worktreeInstanceId,
    binding.coworkingIncarnationId,
    binding.purpose,
    binding.inventoryScope,
    binding.executionHostId,
    binding.worktreePath
  ])
}

export function encodeCoworkingHostSessionPageReleaseBinding(
  binding: CoworkingHostSessionPageReleaseBinding
): string {
  return JSON.stringify([
    binding.physicalConnectionId,
    binding.worktreeId,
    binding.worktreeInstanceId,
    binding.coworkingIncarnationId,
    binding.purpose,
    binding.inventoryScope
  ])
}

export function coworkingHostSessionPageConnectionCleanupId(connectionId: string): string {
  return `coworking.host.session-pages:${connectionId}`
}

export function coworkingHostSessionPageBinding(
  context: RpcContext,
  params: SessionPageBindingParams,
  worktree: CoworkingPairedRuntimeResolvedWorktree
): CoworkingHostSessionPageBinding {
  return {
    ...coworkingHostSessionPageReleaseBinding(context, params),
    executionHostId: worktree.executionHostId,
    worktreePath: worktree.worktreePath
  }
}

export function coworkingHostSessionPageReleaseBinding(
  context: RpcContext,
  params: SessionPageBindingParams
): CoworkingHostSessionPageReleaseBinding {
  return {
    physicalConnectionId: requireSessionPageConnection(context),
    worktreeId: params.target.worktreeId,
    worktreeInstanceId: params.target.instanceId,
    coworkingIncarnationId: params.target.coworkingIncarnationId,
    purpose: params.purpose,
    inventoryScope: params.inventoryScope
  }
}

type SessionPageBindingParams = {
  target: CoworkingPairedRuntimeSessionWorktree
  purpose: CoworkingHistoricalSessionPurpose
  inventoryScope: string
}

function requireSessionPageConnection(context: RpcContext): string {
  if (!context.connectionId) {
    throw new Error('paired_runtime_session_connection_required')
  }
  return context.connectionId
}
