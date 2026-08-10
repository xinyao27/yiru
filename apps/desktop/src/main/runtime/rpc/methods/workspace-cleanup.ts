import type {
  WorkspaceCleanupDismissInput,
  WorkspaceCleanupScanInput,
  RuntimeWorkspaceCleanupDismissResult,
  RuntimeWorkspaceCleanupScanResult
} from '@yiru/runtime-protocol/contract'

import type { RpcContext, RpcHandler } from '../core'

export const handleWorkspaceCleanupScan = ((params, { runtime }) =>
  runtime.scanWorkspaceCleanup(params)) satisfies RpcHandler<
  WorkspaceCleanupScanInput,
  RuntimeWorkspaceCleanupScanResult
>

export const handleWorkspaceCleanupDismiss = ((params, { runtime }) => ({
  dismissals: runtime.dismissWorkspaceCleanupCandidates(params.dismissals)
})) satisfies RpcHandler<WorkspaceCleanupDismissInput, RuntimeWorkspaceCleanupDismissResult>

export function handleWorkspaceCleanupClearDismissals(
  _params: void,
  { runtime }: RpcContext
): RuntimeWorkspaceCleanupDismissResult {
  return { dismissals: runtime.clearWorkspaceCleanupDismissals() }
}
